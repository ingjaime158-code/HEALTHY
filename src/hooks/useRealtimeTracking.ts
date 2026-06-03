/**
 * useRealtimeTracking.ts
 * Custom React hook for smooth GPS marker animation.
 *
 * Architecture:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Subscribes to postgres_changes on driver_locations (UPSERT events)
 * 2. Also subscribes to Broadcast channel for each known driver (faster path)
 * 3. Applies LERP (Linear Interpolation) at 60fps for fluid marker movement
 * 4. Exposes animated positions as React state
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

export interface DriverPosition {
    lat: number;
    lng: number;
    heading: number;
}

interface AnimationEntry {
    current: DriverPosition;
    target: DriverPosition;
    startTime: number;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Ease-in-out cubic for natural-feeling acceleration/deceleration */
function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(Math.max(v, min), max);
}

/** Shortest-arc interpolation for heading (0–360°) */
function lerpAngle(a: number, b: number, t: number): number {
    let delta = ((b - a + 540) % 360) - 180;
    return ((a + delta * t) + 360) % 360;
}

// ── Configuration ─────────────────────────────────────────────────────────────

const LERP_DURATION = 2500; // ms to smoothly transition between GPS points
const PURGE_TIMEOUT = 15 * 60 * 1000; // 15 minutes inactivity (prevents disappearing on signal loss)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeTracking(
    /** Array of driver IDs to subscribe to Broadcast channels (optional optimization) */
    knownDriverIds?: string[]
): { [driverId: string]: DriverPosition } {

    const [positions, setPositions] = useState<{ [driverId: string]: DriverPosition }>({});
    const animMapRef = useRef<Map<string, AnimationEntry & { lastUpdate: number }>>(new Map());
    const rafRef = useRef<number>(0);

    // ── Handle incoming position update (from either source) ──────────────
    const handleNewPosition = useCallback((driverId: string, lat: number, lng: number, heading: number) => {
        const map = animMapRef.current;
        const existing = map.get(driverId);

        // Skip duplicate positions (within ~1m tolerance)
        if (existing) {
            const dLat = Math.abs(existing.target.lat - lat);
            const dLng = Math.abs(existing.target.lng - lng);
            if (dLat < 0.00001 && dLng < 0.00001) {
                // Still update lastUpdate to keep it alive
                existing.lastUpdate = performance.now();
                return;
            }
        }

        const now = performance.now();
        const currentPos = existing
            ? interpolateEntry(existing, now) // Snapshot current animated position
            : { lat, lng, heading };

        map.set(driverId, {
            current: currentPos,
            target: { lat, lng, heading },
            startTime: now,
            lastUpdate: now,
        });
    }, []);

    // ── Interpolate a single entry at a given time ────────────────────────
    function interpolateEntry(entry: AnimationEntry, now: number): DriverPosition {
        const elapsed = now - entry.startTime;
        const rawT = clamp(elapsed / LERP_DURATION, 0, 1);
        const t = easeInOutCubic(rawT);

        return {
            lat: lerp(entry.current.lat, entry.target.lat, t),
            lng: lerp(entry.current.lng, entry.target.lng, t),
            heading: lerpAngle(entry.current.heading, entry.target.heading, t),
        };
    }

    // ── Animation loop (60fps) ────────────────────────────────────────────
    useEffect(() => {
        let running = true;

        const tick = () => {
            if (!running) return;

            const now = performance.now();
            const map = animMapRef.current;
            
            // Purge inactive drivers (5 minutes)
            let hasPurged = false;
            map.forEach((entry, driverId) => {
                if (now - entry.lastUpdate > PURGE_TIMEOUT) {
                    map.delete(driverId);
                    hasPurged = true;
                }
            });

            if (map.size === 0) {
                if (hasPurged) setPositions({}); // Clear UI if all purged
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            const newPositions: { [driverId: string]: DriverPosition } = {};
            map.forEach((entry, driverId) => {
                newPositions[driverId] = interpolateEntry(entry, now);
            });

            setPositions(newPositions);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // ── Subscribe to postgres_changes on driver_locations (reliable) ──────
    useEffect(() => {
        // Use a unique channel name per hook instance to avoid conflicts
        const channelId = `tracking-${Math.random().toString(36).slice(2, 9)}`;
        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'driver_locations',
                },
                (payload) => {
                    const loc = (payload.new || payload.old) as any;
                    if (loc?.driver_id) {
                        const lat = Number(loc.lat);
                        const lng = Number(loc.lng);
                        // Defensive check to avoid passing NaN coordinates
                        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                            handleNewPosition(
                                loc.driver_id,
                                lat,
                                lng,
                                Number(loc.heading) || 0
                            );
                        }
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[GPS] Realtime tracking subscribed: ${channelId}`);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [handleNewPosition]);

    // ── Subscribe to Broadcast channels for known drivers (fast path) ─────
    useEffect(() => {
        if (!knownDriverIds || knownDriverIds.length === 0) return;

        const channels = knownDriverIds.map(driverId => {
            const ch = supabase
                .channel(`gps:${driverId}`)
                .on('broadcast', { event: 'location' }, (msg) => {
                    const p = msg.payload;
                    if (p?.driverId && p?.lat && p?.lng) {
                        const lat = Number(p.lat);
                        const lng = Number(p.lng);
                        // Defensive check to avoid passing NaN coordinates
                        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                            handleNewPosition(
                                p.driverId,
                                lat,
                                lng,
                                Number(p.heading) || 0
                            );
                        }
                    }
                })
                .subscribe();
            return ch;
        });

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch));
        };
    }, [knownDriverIds?.join(','), handleNewPosition]);

    return positions;
}
