import { create } from 'zustand';
import { getBusinesses, updateBusiness, getDrivers, Driver, Business } from '../services/dataService';

interface HealthyDreamsState {
  clients: Business[];
  drivers: Driver[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  fetchClientsAndDrivers: (force?: boolean) => Promise<void>;
  updateClientInStore: (client: Business) => Promise<boolean>;
  setClients: (clients: Business[]) => void;
  setDrivers: (drivers: Driver[]) => void;
  setError: (error: string | null) => void;
}

export const useHealthyDreamsStore = create<HealthyDreamsState>((set, get) => ({
  clients: [],
  drivers: [],
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchClientsAndDrivers: async (force = false) => {
    const { clients, drivers, isLoading } = get();
    
    // Skip fetching if already loading
    if (isLoading) return;
    
    // If we already have cached data and aren't forcing a refresh, skip
    if (clients.length > 0 && drivers.length > 0 && !force) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const [bizList, driversList] = await Promise.all([
        getBusinesses(),
        getDrivers()
      ]);
      set({ 
        clients: bizList, 
        drivers: driversList, 
        isLoading: false 
      });
    } catch (err: any) {
      console.error('[ZustandStore] Error fetching system data:', err);
      set({ 
        isLoading: false, 
        error: err?.message || 'Error al obtener datos del sistema.' 
      });
    }
  },

  updateClientInStore: async (client: Business) => {
    const { clients } = get();
    
    // Optimistic Update in State
    const previousClients = [...clients];
    const updatedClients = clients.map(c => c.id === client.id ? client : c);
    set({ clients: updatedClients });

    try {
      const success = await updateBusiness(client);
      if (!success) {
        throw new Error('updateBusiness returned false');
      }
      return true;
    } catch (err) {
      console.error('[ZustandStore] Error updating client, rolling back:', err);
      // Rollback on failure
      set({ clients: previousClients });
      return false;
    }
  },

  setClients: (clients) => set({ clients }),
  setDrivers: (drivers) => set({ drivers }),
  setError: (error) => set({ error })
}));
