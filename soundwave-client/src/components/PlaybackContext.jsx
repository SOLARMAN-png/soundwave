import { createContext, useContext } from "react";

export const PlaybackContext = createContext(null);

export function usePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("Playback controls must be used inside the app layout");
  return playback;
}
