import { useSyncExternalStore } from "react";
import { BiExitFullscreen, BiFullscreen } from "react-icons/bi";

function getSnapshot() {
  return Boolean(document.fullscreenElement);
}

function getServerSnapshot() {
  return false;
}

function subscribe(callback: () => void) {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
}

function useIsFullscreen() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const FullScreenIcon = () => {
  const isFullscreen = useIsFullscreen();

  return isFullscreen ? (
    <BiExitFullscreen
      title="Exit Fullscreen"
      onClick={() => {
        document.exitFullscreen();
      }}
    />
  ) : (
    <BiFullscreen
      title="Enter Fullscreen"
      onClick={() => {
        document.documentElement.requestFullscreen();
      }}
    />
  );
};

export default FullScreenIcon;
