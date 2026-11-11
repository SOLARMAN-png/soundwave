import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

type MediaResource = "image" | "video";

function getCloudinaryCredentials() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured. Set its credentials in the API environment.");
  }

  return { cloudName, apiKey, apiSecret };
}

export function createUploadSignature(resourceType: MediaResource) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const folder = `soundwave/${resourceType === "video" ? "audio" : "covers"}`;
  const params = {
    folder,
    public_id: randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
  };

  return {
    cloudName,
    apiKey,
    resourceType,
    ...params,
    signature: cloudinary.utils.api_sign_request(params, apiSecret),
  };
}

export async function deleteMedia(publicId: string, resourceType: MediaResource) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

export async function inspectMedia(publicId: string, resourceType: MediaResource) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  const result = await cloudinary.api.resource(publicId, { resource_type: resourceType });

  return {
    url: result.secure_url as string,
    format: result.format as string,
    bytes: result.bytes as number,
  };
}