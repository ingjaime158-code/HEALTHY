import { create } from 'zustand';
import { Trip, FleetUnit, Driver } from '../services/dataService';

export interface NewClientState {
  name: string;
  phone: string;
  address: string;
  locationLink: string;
  coords: string;
  bags: number;
  planType: string;
  plansCount: number;
  exclusions: string;
  siglas: string;
  driver: string;
}

const defaultNewClient = { 
  name: '', 
  phone: '', 
  address: '', 
  locationLink: '', 
  coords: '', 
  bags: 0,
  planType: 'HEALTHY',
  plansCount: 1,
  exclusions: 'Ninguna',
  siglas: 'C',
  driver: '' 
};

interface AppState {
  activeTrips: Trip[];
  setActiveTrips: (trips: Trip[]) => void;
  units: FleetUnit[];
  setUnits: (units: FleetUnit[]) => void;
  drivers: Driver[];
  setDrivers: (drivers: Driver[]) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  
  newClient: NewClientState;
  setNewClient: (client: Partial<NewClientState>) => void;
  resetNewClient: () => void;
  
  selectingFor: 'origin' | 'destination' | null;
  setSelectingFor: (target: 'origin' | 'destination' | null) => void;
  
  draftMarker: { lat: number; lng: number } | null;
  setDraftMarker: (marker: { lat: number; lng: number } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTrips: [],
  setActiveTrips: (trips) => set({ activeTrips: trips }),
  units: [],
  setUnits: (units) => set({ units: units }),
  drivers: [],
  setDrivers: (drivers) => set({ drivers: drivers }),
  isSidebarOpen: false,
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  
  newClient: defaultNewClient,
  setNewClient: (client) => set((state) => ({ newClient: { ...state.newClient, ...client } })),
  resetNewClient: () => set({ newClient: defaultNewClient }),
  
  selectingFor: null,
  setSelectingFor: (target) => set({ selectingFor: target }),
  
  draftMarker: null,
  setDraftMarker: (marker) => set({ draftMarker: marker }),
}));
