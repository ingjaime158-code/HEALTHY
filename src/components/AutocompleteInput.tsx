import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

/**
 * Google Places Autocomplete input component.
 * Restricted to Mexico results.
 */
const AutocompleteInput = ({ onPlaceSelect, placeholder, className }: {
    onPlaceSelect: (place: { address: string, name: string, lat: number, lng: number }) => void,
    placeholder: string,
    className?: string
}) => {
    const placesLib = useMapsLibrary('places');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!placesLib || !inputRef.current) return;

        const autocomplete = new placesLib.Autocomplete(inputRef.current, {
            fields: ['formatted_address', 'geometry', 'name'],
            componentRestrictions: { country: 'mx' }
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                onPlaceSelect({
                    address: place.formatted_address || '',
                    name: place.name || '',
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                });
            }
        });
    }, [placesLib]);

    return <input ref={inputRef} type="text" className={className} placeholder={placeholder} />;
};

export default AutocompleteInput;
