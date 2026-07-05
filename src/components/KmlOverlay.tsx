import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

interface KmlOverlayProps {
    /** The Google My Maps URL (viewer, editor, or embed) */
    kmlUrl: string;
}

/**
 * Renders a Google My Maps layer on the existing map using google.maps.Data
 * for full custom icon support, plus KmlLayer as a fallback for routes/polylines.
 *
 * This approach:
 * 1. Loads the KML via KmlLayer for route lines & polygon rendering
 * 2. Everything syncs perfectly with zoom/pan since it's on the SAME map instance
 * 3. Clicking on placemarks shows info windows with the original My Maps data
 */

function extractMid(url: string): string | null {
    if (!url) return null;
    const midMatch = url.match(/mid=([^&\s]+)/);
    if (midMatch) return midMatch[1];
    const pathMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];
    return null;
}

const KmlOverlay = ({ kmlUrl }: KmlOverlayProps) => {
    const map = useMap();
    const layerRef = useRef<google.maps.KmlLayer | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    const cleanup = useCallback(() => {
        if (layerRef.current) {
            layerRef.current.setMap(null);
            layerRef.current = null;
        }
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!map || !kmlUrl) return;

        // Remove previous layers
        cleanup();

        const mid = extractMid(kmlUrl);
        if (!mid) {
            console.warn('[KmlOverlay] Could not extract mid from URL:', kmlUrl);
            return;
        }

        // Removed &forcekml=1 so My Maps serves a KMZ (zipped) file instead of raw KML.
        // KMZ files bundle the custom icon images (stars, P, circles) inside the zip,
        // allowing KmlLayer to render them correctly instead of defaulting to grey teardrops.
        const cacheBust = Math.floor(Date.now() / 300000);
        const finalUrl = `https://www.google.com/maps/d/kml?mid=${mid}&cb=${cacheBust}`;

        console.log('[KmlOverlay] Preparing KMZ layer:', finalUrl);

        let kmlLayer: google.maps.KmlLayer | null = null;
        let isCleanedUp = false;

        const loadLayer = () => {
            if (isCleanedUp || kmlLayer) return;
            console.log('[KmlOverlay] Instantiating KmlLayer...');
            kmlLayer = new google.maps.KmlLayer({
                url: finalUrl,
                map: map,
                preserveViewport: true,
                suppressInfoWindows: false, // Show info popups on click
            });

            kmlLayer.addListener('status_changed', () => {
                const status = kmlLayer?.getStatus();
                console.log('[KmlOverlay] Status:', status);
            });

            layerRef.current = kmlLayer;
        };

        // Wait for the map to be fully loaded and settled before instantiating the KmlLayer.
        // This solves the initial loading race condition when the map is not yet idle.
        const listener = map.addListener('idle', () => {
            loadLayer();
        });

        // Fallback timeout in case 'idle' takes too long or doesn't fire
        const timeoutId = setTimeout(() => {
            loadLayer();
        }, 1200);

        cleanupRef.current = () => {
            isCleanedUp = true;
            if (listener) {
                google.maps.event.removeListener(listener);
            }
            clearTimeout(timeoutId);
            if (kmlLayer) {
                kmlLayer.setMap(null);
            }
        };

        return () => cleanup();
    }, [map, kmlUrl, cleanup]);

    return null;
};

export default KmlOverlay;
