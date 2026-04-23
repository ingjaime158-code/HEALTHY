import { useState, useEffect } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { checkMapQuota, incrementMapQuota } from '../services/mapsQuotaService';

/**
 * Renders a Google Maps Directions route between origin and destination,
 * optionally passing through waypoints.
 */
const TripRoute = ({ originLat, originLng, destLat, destLng, color, onRoutesFound, routeIndex = 0, showAlternatives = false, waypoints = [] }: { 
    originLat: number, 
    originLng: number, 
    destLat: number, 
    destLng: number, 
    color: string,
    onRoutesFound?: (routes: google.maps.DirectionsRoute[]) => void,
    routeIndex?: number,
    showAlternatives?: boolean,
    waypoints?: { lat: number; lng: number }[]
}) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);

    // Initialize Service & Renderer once
    useEffect(() => {
        if (!routesLibrary || !map) return;
        const renderer = new routesLibrary.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: color,
                strokeWeight: 4,
                strokeOpacity: 0.8
            },
            preserveViewport: true
        });
        setDirectionsRenderer(renderer);
        setDirectionsService(new routesLibrary.DirectionsService());

        return () => {
            renderer.setMap(null);
        };
    }, [routesLibrary, map, color]);

    // Update route index when it changes
    useEffect(() => {
        if (directionsRenderer) {
            directionsRenderer.setRouteIndex(routeIndex);
        }
    }, [directionsRenderer, routeIndex]);

    // Calculate Route only when coordinates actually change
    useEffect(() => {
        if (!directionsService || !directionsRenderer) return;

        const request: google.maps.DirectionsRequest = {
            origin: { lat: originLat, lng: originLng },
            destination: { lat: destLat, lng: destLng },
            travelMode: google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: showAlternatives && waypoints.length === 0,
            ...(waypoints.length > 0 ? {
                waypoints: waypoints.map(wp => ({ location: new google.maps.LatLng(wp.lat, wp.lng), stopover: true })),
                optimizeWaypoints: false
            } : {})  
        };

        if (!checkMapQuota()) {
            console.warn("Quota exceeded, skipping TripRoute request");
            return;
        }

        incrementMapQuota();

        directionsService.route(request)
            .then(response => {
                directionsRenderer.setDirections(response);
                if (onRoutesFound) onRoutesFound(response.routes);
            })
            .catch(e => {
                if (e.code === 'OVER_QUERY_LIMIT') console.warn("Maps Quota Hit");
            });
    }, [directionsService, directionsRenderer, originLat, originLng, destLat, destLng, JSON.stringify(waypoints)]);

    return null;
};

export default TripRoute;
