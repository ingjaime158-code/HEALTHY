import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * TrafficLayer – Renders the Google Maps Traffic Layer on the current map instance.
 * Shows real-time traffic conditions using the native google.maps.TrafficLayer API.
 */
const TrafficLayer = () => {
    const map = useMap();
    const layerRef = useRef<google.maps.TrafficLayer | null>(null);

    useEffect(() => {
        if (!map) return;

        // Create the traffic layer and attach it
        const trafficLayer = new google.maps.TrafficLayer();
        trafficLayer.setMap(map);
        layerRef.current = trafficLayer;

        return () => {
            // Cleanup: remove layer when unmounted
            trafficLayer.setMap(null);
            layerRef.current = null;
        };
    }, [map]);

    return null;
};

export default TrafficLayer;
