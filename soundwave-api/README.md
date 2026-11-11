# Soundwave API

## Authentication

Authentication uses an HS256 JWT access token and a rotating refresh token. By default, access tokens last 15 minutes and refresh tokens last seven days; configure these with `JWT_ACCESS_TOKEN_TTL_SECONDS` and `JWT_REFRESH_TOKEN_TTL_SECONDS`. The browser receives them in separate `HttpOnly` cookies named `soundwave_access` and `soundwave_refresh`; MongoDB stores one SHA-256 hash record per refresh token in the `refreshsessions` collection, along with its family, expiry, rotation, and revocation state. Reuse of a rotated token revokes its whole family. Rotated-token records are retained for 30 days beyond expiry for reuse detection, then removed by a TTL index. Refresh sessions are revoked on logout. Access tokens expire naturally, so a token already issued can remain valid until its configured expiry after logout. Passwords are hashed with bcrypt and are never included in API responses.

The former `sessions` collection and `soundwave_session` cookie are legacy only. Legacy cookies are cleared and never accepted for access or refresh. Existing session records are not migrated; the old collection's TTL index removes them after their original expiry.

Set `JWT_ACCESS_SECRET` to a private random value of at least 32 bytes, `JWT_ISSUER` to this API's issuer identifier, and `JWT_AUDIENCE` to the intended client identifier. All three are required; the API refuses to start with missing or invalid values. Generate a local secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and keep it only in the ignored `.env` file. Never commit the secret.

Access and refresh cookies are always `HttpOnly`, scoped to `/api`, and use `AUTH_COOKIE_SAME_SITE` (`lax`, `strict`, or `none`; default `lax`). `AUTH_COOKIE_SECURE` defaults to enabled in production and disabled otherwise; production requires it to remain enabled, and `SameSite=None` requires `Secure`. Set `AUTH_COOKIE_DOMAIN` only when deployment requires a shared cookie domain. The API enables credentialed CORS for the exact `CLIENT_ORIGIN` configured in the environment.

Every non-read API request requires the exact configured `Origin`, a signed `soundwave_csrf` cookie, and a matching `X-CSRF-Token` header. Fetch `GET /api/auth/csrf` to initialize the token; the client API wrapper does this automatically and retries once if the token expires. The CSRF cookie is intentionally readable by the client, but its signature is verified by the API. This also protects login, registration, email verification, refresh, logout, and all authenticated mutations. Non-browser callers must send the configured `Origin`, CSRF cookie, and matching header too.

### Routes

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Create a pending account and send an email confirmation link | `201` |
| `POST` | `/api/auth/resend-verification` | Send a new confirmation link to a pending account | `202` |
| `POST` | `/api/auth/verify-email` | Confirm an email and issue the first auth session | `200` |
| `GET` | `/api/auth/csrf` | Issue a CSRF cookie and request token | `200` |
| `POST` | `/api/auth/login` | Sign in with email and password | `200` |
| `POST` | `/api/auth/refresh` | Rotate the refresh token and issue a new access token | `200` |
| `POST` | `/api/auth/logout` | Revoke the refresh session and clear both cookies | `204` |
| `GET` | `/api/auth/onboarding` | Read the current user's preferences and onboarding status | `200` |
| `PUT` | `/api/auth/onboarding` | Validate and save the current user's genre/artist preferences and mark onboarding complete | `200` |
| `GET` | `/api/recommendations` | Return up to three random tracks matching the current user's preferences | `200` |
| `GET` | `/api/auth/me` | Return the current signed-in user | `200` |

Registration expects `email`, `password`, and `displayName`; `username` is optional. Passwords must be at least 12 characters and no more than 72 UTF-8 bytes. Email and username are normalized to lowercase. New accounts receive no auth cookies until their email is confirmed. Verification links expire after 24 hours and are single-use; only a hash of each token is stored. Existing accounts without an `emailVerified` field remain treated as verified. Invalid input returns `400`; duplicate accounts return `409`; invalid credentials return `401`; an unverified account receives `403`. Registration and login are limited to 10 attempts per IP per 15 minutes; excess attempts return `429`.

If a confirmation email is missing, submit its address to `POST /api/auth/resend-verification`. The API returns the same `202` response whether or not a pending account exists, and the route shares the authentication rate limit.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in the ignored `.env` file. `SMTP_SECURE` defaults to `true` for port 465 and `false` otherwise. If delivery is not configured or fails, registration returns `503` and removes the pending account so the user can safely try again. Never commit SMTP credentials.

Auth responses include `onboardingCompleted`. New accounts are created with this value set to `false`; existing user documents without the field are treated as complete so returning users are not redirected unexpectedly. Onboarding completion should be set only after the user's preferences have been saved successfully.

Preferences are embedded on the user as normalized genre names and artist ObjectIds, with a preference update timestamp and onboarding completion timestamp. `PUT /api/auth/onboarding` accepts at most five unique genres and ten unique artist IDs, and requires at least one selection. Genres are checked against genres on published tracks, and artists against the artist catalog. Unknown selections return `422`; preference and completion timestamps update together only after all selections validate.

`GET /api/auth/onboarding` returns the authenticated user's preferences and onboarding status. Users without saved preferences receive empty genre and artist selections, with null preference timestamps.

`GET /api/recommendations` requires authentication and samples up to three published tracks matching any saved genre or artist selection. It returns an empty list when the user has no saved selections or no matching tracks.

Example registration:

For non-browser registration or authentication, first request `/api/auth/csrf`, retain its cookie and `csrfToken`, then send the configured `Origin` and `X-CSRF-Token` header on the state-changing request.

For browser requests, include credentials so the browser accepts and sends the authentication cookies:

```js
fetch("http://localhost:3000/api/auth/me", {
  credentials: "include",
});
```

Do not return, log, or store raw authentication cookies in application state or local storage. Keep the API and frontend on the same site when possible; cross-site production deployments need deliberate cookie and CSRF configuration. A `401` from an access-token-protected endpoint can be followed by one `POST /api/auth/refresh` attempt; if that also returns `401`, the user must sign in again.

## Playlists

All playlist endpoints require a signed-in user. Users can list and modify only their own playlists. Public playlists can be read by any signed-in user; private playlists are only visible to their owner. A non-owner receives `404` for a private playlist or any attempted edit.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/playlists` | Create an owned playlist |
| `GET` | `/api/playlists?page=1&limit=20` | List the current user's playlists |
| `GET` | `/api/playlists/:id` | Retrieve playlist details and ordered tracks |
| `PATCH` | `/api/playlists/:id` | Update name, description, artwork, or visibility |
| `POST` | `/api/playlists/:id/tracks` | Add a track; optional `position` inserts it at that zero-based position |
| `PATCH` | `/api/playlists/:id/tracks/order` | Reorder all tracks by sending the complete ordered `trackIds` array |
| `DELETE` | `/api/playlists/:id/tracks/:trackId` | Remove a track |

Track insertion, removal, and reordering use MongoDB transactions to keep track positions consistent. The MongoDB deployment must support transactions (MongoDB Atlas does). Playlist track positions are zero-based and unique within each playlist.

## Library

All library routes require a signed-in user and only read or change that user's likes and follows. `PUT` operations are idempotent and return `204`; `DELETE` operations are also idempotent and return `204`. A like/follow request for an unknown catalog item returns `404`. List routes accept `page` and `limit` (default `1` and `20`, maximum `50`) and return populated track or artist details with pagination metadata.

| Method | Path | Purpose |
| --- | --- | --- |
| `PUT` | `/api/library/tracks/:trackId` | Like/save a track |
| `DELETE` | `/api/library/tracks/:trackId` | Unlike/remove a saved track |
| `GET` | `/api/library/tracks?page=1&limit=20` | List the current user's liked tracks |
| `PUT` | `/api/library/artists/:artistId` | Follow an artist |
| `DELETE` | `/api/library/artists/:artistId` | Unfollow an artist |
| `GET` | `/api/library/artists?page=1&limit=20` | List the current user's followed artists |

Unique compound indexes on `(userId, trackId)` and `(userId, artistId)` prevent duplicate likes and follows, including concurrent repeated requests.

## Playback history

Playback history records listening events only; it does not stream or serve audio. All history routes require a signed-in user, and users can only retrieve or delete their own events. Each `POST` creates a new event, including repeat plays. `playedAt` is set by the API; clients cannot backdate events. Track details are populated in responses. List routes accept `page` and `limit` (default `1` and `20`, maximum `50`) and return newest events first with pagination metadata.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/history` | Record a play event |
| `GET` | `/api/history?page=1&limit=20` | List the current user's recent plays |
| `DELETE` | `/api/history/:id` | Delete one of the current user's history entries |

The record body requires `trackId`. Optional fields are `secondsPlayed` (0–86,400), `completionPercent` (0–100), and the paired `contextType`/`contextId` fields. Context types are `playlist`, `album`, `artist`, `search`, and `ai`. Invalid input returns `400`; an unknown track returns `404`.

## Admin catalog uploads

Set these variables in the API's private `.env` file. `ADMIN_EMAILS` is a comma-separated allowlist of existing Soundwave account emails. Cloudinary credentials are server-only; never add the API secret to the React app or a `VITE_` variable.

```env
ADMIN_EMAILS=you@example.com
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Create a Cloudinary account and copy its cloud name, API key, and API secret from the account dashboard. Register an account through `POST /api/auth/register` if needed, then put that account's email in `ADMIN_EMAILS`. Sign in at `/admin`. The dashboard signs each upload on the API, sends audio and cover files directly to Cloudinary, verifies the returned assets, and stores the URLs, Cloudinary IDs, track details, and artist/album references in MongoDB. Track uploads create or reuse an album automatically. The separate album form accepts a title, artist, optional release date, artwork, and one audio file per track (up to 50); each track has its own title, genre, duration, and explicit-content flag. It creates the album and its ordered track records through `POST /api/admin/albums`. Admins can permanently delete a track with `DELETE /api/admin/tracks/:id` or an album and all its tracks with `DELETE /api/admin/albums/:id`; these operations also clear likes, playlist entries, playback history, and unreferenced Cloudinary files. Newly uploaded albums appear in the Home page's `Just added` section, which requests `GET /api/albums?sort=recent`; opening an album loads its published tracks from `GET /api/albums/:id`. New tracks are published immediately and appear in the public `GET /api/tracks` catalog; the React Home and Search views use that endpoint, and the player streams the stored audio URL.

Audio is uploaded as Cloudinary `video` media, which is Cloudinary's media resource type for audio files. Keep audio at or below 100 MB and cover artwork at or below 8 MB. In production, set `VITE_API_URL` for the client and configure the API's `CLIENT_ORIGIN` to the exact client origin.
