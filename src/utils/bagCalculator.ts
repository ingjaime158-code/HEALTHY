/**
 * Utility functions to calculate meal times and bags for Healthy Dreams clients.
 */

export interface ClientConfig {
  extraDishes?: number;
  tiempos?: number;
  plans?: Array<{ tiempos?: number }>;
  [key: string]: any;
}

/**
 * Parses client email JSON safely to get total meal times.
 */
export function getClientTiempos(emailJson: string | null): number {
  if (emailJson && emailJson.startsWith('{') && emailJson.endsWith('}')) {
    try {
      const parsed: ClientConfig = JSON.parse(emailJson);
      let sumTiempos = parsed.tiempos || 0;
      if (sumTiempos === 0 && parsed.plans && Array.isArray(parsed.plans)) {
        sumTiempos = parsed.plans.reduce((sum: number, p: any) => sum + (p.tiempos || 1), 0);
      }
      return sumTiempos > 0 ? sumTiempos : 1;
    } catch (e) {
      console.warn('Error parsing client email JSON for tiempos:', e);
    }
  }
  return 1;
}

/**
 * Calculates how many delivery bags a client needs based on their meal times and current day of the week.
 */
export function calculateBagsForClient(emailJson: string | null): number {
  let extraDishes = 0;
  let sumTiempos = 1;

  if (emailJson && emailJson.startsWith('{') && emailJson.endsWith('}')) {
    try {
      const parsed: ClientConfig = JSON.parse(emailJson);
      extraDishes = parsed.extraDishes || 0;
      sumTiempos = parsed.tiempos || 0;
      if (sumTiempos === 0 && parsed.plans && Array.isArray(parsed.plans)) {
        sumTiempos = parsed.plans.reduce((sum: number, p: any) => sum + (p.tiempos || 1), 0);
      }
      if (sumTiempos === 0) {
        sumTiempos = 1;
      }
    } catch (e) {
      // safe ignore
    }
  }

  const dishesSunMon = (sumTiempos * 3) + extraDishes;
  const bagsSunMon = Math.ceil(dishesSunMon / 6);
  const dishesWedThu = (sumTiempos * 2) + extraDishes;
  const bagsWedThu = Math.ceil(dishesWedThu / 6);

  const dayOfWeek = new Date().getDay();
  const isSundayOrMonday = dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2;

  return isSundayOrMonday ? bagsSunMon : bagsWedThu;
}
