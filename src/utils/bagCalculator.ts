/**
 * Utility functions to calculate meal times and bags for Healthy Dreams clients.
 *
 * Rules:
 * - Maximum capacity per delivery bag: 6 dishes (platillos).
 * - Delivery Cycle 1 (Domingo / Lunes): covers 3 days (Lun, Mar, Mié) -> ceil((tiempos * 3) / 6).
 * - Delivery Cycle 2 (Miércoles / Jueves + Sáb y Dom): covers 4 days (Jue, Vie, Sáb, Dom) -> ceil((tiempos * 4) / 6).
 * - Multi-client addresses ('&' in client name): each person separated by '&' has their own plan/tiempos,
 *   and their bags are calculated separately (minimum 1 bag per person) and summed for the address.
 */

import { getNormalizedClientPlans, parseClientProfile, splitClientNames, ClientPlanItem } from './clientProfile';

export interface ClientConfig {
  extraDishes?: number;
  tiempos?: number;
  plans?: Array<{ tiempos?: number; siglas?: string; planType?: string; clientName?: string }>;
  [key: string]: any;
}

export interface PersonBagDetail {
  clientName: string;
  planType: string;
  siglas: string;
  tiempos: number;
  dishesSunMon: number;
  bagsSunMon: number;
  dishesWedSun: number;
  bagsWedSun: number;
  bagsWeekendOnly: number;
  activeBags: number;
}

export interface BagCalculationBreakdown {
  bagsSunMon: number;      // Ciclo Dom/Lun (3 días: Lun, Mar, Mié) -> ceil((tiempos * 3) / 6) por persona
  bagsWedSun: number;      // Ciclo Mié/Jue + Fin de Semana (4 días: Jue, Vie, Sáb, Dom) -> ceil((tiempos * 4) / 6) por persona
  bagsWeekendOnly: number; // Fin de Semana (2 días: Sáb, Dom) -> ceil((tiempos * 2) / 6) por persona
  activeBags: number;      // Bolsas activas según el día de la semana actual
  isSundayOrMonday: boolean;
  totalTiempos: number;
  clientsCount: number;
  extraDishes: number;
  perPerson: PersonBagDetail[];
}

/**
 * Parses client email JSON safely to get total meal times (platillos por día) across all plans/people at the address.
 */
export function getClientTiempos(emailJson: string | null | undefined, clientName?: string | null): number {
  const plans = getNormalizedClientPlans(emailJson, clientName);
  const sum = plans.reduce((acc, p) => acc + (p.tiempos || 1), 0);
  return sum > 0 ? sum : 1;
}

/**
 * Calculates full bag breakdown from a list of plans, client name, and extra dishes.
 */
export function calculateBagsFromPlans(
  plans: ClientPlanItem[],
  clientName?: string | null,
  extraDishes: number = 0,
  dayOfWeekOverride?: number
): BagCalculationBreakdown {
  const subNames = splitClientNames(clientName);
  const dayOfWeek = dayOfWeekOverride !== undefined ? dayOfWeekOverride : new Date().getDay();
  // Domingo (0), Lunes (1), Martes (2) -> Ciclo 3 días (Lun-Mié)
  // Miércoles (3), Jueves (4), Viernes (5), Sábado (6) -> Ciclo 4 días incluyendo Sáb y Dom (Jue-Dom)
  const isSundayOrMonday = dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2;

  const effectivePlans: ClientPlanItem[] =
    plans.length > 0
      ? plans
      : [
          {
            id: 'plan-1',
            clientName: subNames[0] || '',
            planType: 'HEALTHY',
            package: 'Comida',
            siglas: 'C',
            tiempos: 1
          }
        ];

  const perPerson: PersonBagDetail[] = [];

  if (subNames.length > 1) {
    // Multi-client row separated by '&': calculate bags per person separately and sum them
    for (let i = 0; i < effectivePlans.length; i++) {
      const p = effectivePlans[i];
      const personName = p.clientName || subNames[i] || subNames[subNames.length - 1] || `Cliente ${i + 1}`;
      const tiempos = Math.max(1, p.tiempos || 1);
      // Apply extraDishes to the first person if any
      const personExtra = i === 0 ? extraDishes : 0;

      const dishesSunMon = tiempos * 3 + personExtra;
      const bagsSunMon = Math.max(1, Math.ceil(dishesSunMon / 6));

      const dishesWedSun = tiempos * 4 + personExtra;
      const bagsWedSun = Math.max(1, Math.ceil(dishesWedSun / 6));

      const bagsWeekendOnly = Math.max(1, Math.ceil((tiempos * 2 + personExtra) / 6));
      const activeBags = isSundayOrMonday ? bagsSunMon : bagsWedSun;

      perPerson.push({
        clientName: personName,
        planType: p.planType || 'NINGUNO',
        siglas: p.siglas || 'C',
        tiempos,
        dishesSunMon,
        bagsSunMon,
        dishesWedSun,
        bagsWedSun,
        bagsWeekendOnly,
        activeBags
      });
    }
  } else {
    // Single client at address (may have 1 or multiple plans for the same person)
    const totalTiemposSingle = Math.max(
      1,
      effectivePlans.reduce((acc, p) => acc + (p.tiempos || 1), 0)
    );
    const dishesSunMon = totalTiemposSingle * 3 + extraDishes;
    const bagsSunMon = Math.max(1, Math.ceil(dishesSunMon / 6));

    const dishesWedSun = totalTiemposSingle * 4 + extraDishes;
    const bagsWedSun = Math.max(1, Math.ceil(dishesWedSun / 6));

    const bagsWeekendOnly = Math.max(1, Math.ceil((totalTiemposSingle * 2 + extraDishes) / 6));
    const activeBags = isSundayOrMonday ? bagsSunMon : bagsWedSun;

    perPerson.push({
      clientName: subNames[0] || effectivePlans[0]?.clientName || 'Cliente',
      planType: effectivePlans.map(p => p.planType || 'NINGUNO').join(' + '),
      siglas: effectivePlans.map(p => p.siglas || 'C').join(' + '),
      tiempos: totalTiemposSingle,
      dishesSunMon,
      bagsSunMon,
      dishesWedSun,
      bagsWedSun,
      bagsWeekendOnly,
      activeBags
    });
  }

  const bagsSunMon = perPerson.reduce((acc, p) => acc + p.bagsSunMon, 0);
  const bagsWedSun = perPerson.reduce((acc, p) => acc + p.bagsWedSun, 0);
  const bagsWeekendOnly = perPerson.reduce((acc, p) => acc + p.bagsWeekendOnly, 0);
  const totalTiempos = effectivePlans.reduce((acc, p) => acc + Math.max(1, p.tiempos || 1), 0);
  const activeBags = isSundayOrMonday ? bagsSunMon : bagsWedSun;

  return {
    bagsSunMon,
    bagsWedSun,
    bagsWeekendOnly,
    activeBags,
    isSundayOrMonday,
    totalTiempos,
    clientsCount: subNames.length,
    extraDishes,
    perPerson
  };
}

/**
 * Returns the full bag breakdown for a client's serialized email JSON and name.
 */
export function calculateBagsBreakdown(
  emailJson: string | null | undefined,
  clientName?: string | null,
  dayOfWeekOverride?: number
): BagCalculationBreakdown {
  const profile = parseClientProfile(emailJson);
  const extraDishes = profile.extraDishes || 0;
  const plans = getNormalizedClientPlans(emailJson, clientName);
  return calculateBagsFromPlans(plans, clientName, extraDishes, dayOfWeekOverride);
}

/**
 * Calculates how many delivery bags a client needs based on their meal times,
 * whether there are multiple clients separated by '&', and current day of the week.
 */
export function calculateBagsForClient(
  emailJson: string | null | undefined,
  clientName?: string | null,
  dayOfWeekOverride?: number
): number {
  return calculateBagsBreakdown(emailJson, clientName, dayOfWeekOverride).activeBags;
}
