import { supabase } from '../supabaseClient';

export interface RouteDistributionTelemetry {
  route_date: string;
  route_type: string;
  clients_data: any;
}

/**
 * Persists the telemetry snapshot of daily route distribution into Supabase.
 */
export const saveRouteDistributionTelemetry = async (
  telemetry: RouteDistributionTelemetry
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('route_distribution_telemetry')
      .insert([telemetry]);

    if (error) {
      console.error('[TelemetryService] Error saving route distribution telemetry:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TelemetryService] Exception saving route distribution telemetry:', err);
    return false;
  }
};
