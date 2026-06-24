// Re-export explicitly the broken-down modules for backward compatibility
export * from './api/types';
export * from './api/businessService';
export * from './api/businessOriginService';
export * from './api/fleetService';
export { getRouteMaps as getDestinations, addRouteMap as addDestination, updateRouteMap as updateDestination, deleteRouteMap as deleteDestination } from './api/destinationService';
export { getPricingSettings, savePricingSettings, getTrips, getTripsByDateRange, getTripsPaginated, getActiveTrips, addTrip, updateTripStatus, getPublicTripDetails, confirmTripCost, updateTripPaymentStatus, updateTrip, deleteTrip, deleteTripsBulk } from './api/tripService';
export * from './api/kpiService';
export * from './api/marketplaceService';
export * from './api/leadService';
export * from './api/creditService';
export * from './api/financeService';
export * from './api/telemetryService';

