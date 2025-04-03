import { useEffect, useState } from "react";
import { BiExitFullscreen, BiFullscreen } from "react-icons/bi";

const FullScreenIcon = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        // Add listener to fullscreen changes
        function onFullscreenChange() {
            setIsFullscreen(Boolean(document.fullscreenElement));
        }
        document.addEventListener('fullscreenchange', onFullscreenChange);

        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, [])

    return isFullscreen ?
        <BiExitFullscreen title='Exit Fullscreen'
            onClick={() => { document.exitFullscreen(); setIsFullscreen(false) }}
        />
        :
        <BiFullscreen title='Enter Fullscreen'
            onClick={() => { document.documentElement.requestFullscreen(); setIsFullscreen(true) }}
        />
}

export default FullScreenIcon;