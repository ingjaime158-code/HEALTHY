import { test, expect } from '@playwright/test';

test.describe('E2E Completo del Proyecto Healthy Dreams', () => {

    test('1. Landing Page carga correctamente', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Healthy Dreams/i);
        // Verificar elementos clave de la landing
        await expect(page.getByText('Sinergia Operativa').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Acceso Portal/i })).toBeVisible();
    });

    test('2. Navegación a Login', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /Acceso Portal/i }).click();
        await expect(page).toHaveURL(/.*login/);
        await expect(page.getByRole('button', { name: /Continuar con Google/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Continuar con Microsoft/i })).toBeVisible();
    });

    test('3. Flujo de Administrador (Login Simulado y Navegación)', async ({ page }) => {
        // Setup admin session
        await page.addInitScript(() => {
            localStorage.setItem('hd_current_user', 'admin@healthydreams.com');
            localStorage.setItem('hd_user_role', 'Administrador');
            localStorage.setItem('hd_test_skip_auth_clear', 'true');
        });

        // Mock Supabase API
        await page.route('**/rest/v1/*', async (route) => {
            const url = route.request().url();
            const method = route.request().method();

            if (url.includes('settings')) {
                if (method === 'GET') {
                    await route.fulfill({ status: 200, body: JSON.stringify({ base_fare: 35, cost_per_km: 15, commission_percentage: 20 }) });
                } else {
                    await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
                }
            } else if (url.includes('allowed_users')) {
                await route.fulfill({ status: 200, body: JSON.stringify([{ role: 'Administrador', name: 'Admin Test' }]) });
            } else {
                await route.fulfill({ status: 200, body: JSON.stringify([]) });
            }
        });

        console.log('Navegando al Dashboard como Admin...');
        await page.goto('/#/dashboard');
        await expect(page.getByText('Salir').first()).toBeVisible({ timeout: 15000 });

        // Navigation check
        const sections = ['Monitor', 'Trips', 'Registry', 'Leads', 'Settings', 'Access'];
        for (const section of sections) {
            console.log(`Verificando sección: ${section}...`);
            await page.goto(`/#/${section.toLowerCase()}`);
            if (section === 'Monitor') await expect(page.getByText(/Nueva Carrera/i).first()).toBeVisible();
            if (section === 'Trips') await expect(page.getByText(/Gestión de Viajes/i).first()).toBeVisible();
            if (section === 'Settings') await expect(page.getByText(/Configuración/i).first()).toBeVisible();
        }
    });

    test('4. Verificación de Nuevas Funcionalidades (Tarifas, Monitor y Trips)', async ({ page }) => {
        // Setup same admin session
        await page.addInitScript(() => {
            localStorage.setItem('hd_current_user', 'admin@healthydreams.com');
            localStorage.setItem('hd_user_role', 'Administrador');
            localStorage.setItem('hd_test_skip_auth_clear', 'true');
        });

        // Mock Supabase API
        await page.route('**/rest/v1/*', async (route) => {
            const url = route.request().url();
            const method = route.request().method();
            console.log(`[Mock] ${method} ${url}`);

            if (url.includes('settings')) {
                if (method === 'GET') {
                    console.log('[Mock] Returning settings data');
                    await route.fulfill({ status: 200, body: JSON.stringify({ base_fare: 35, cost_per_km: 15, commission_percentage: 20 }) });
                } else if (method === 'HEAD') {
                    console.log('[Mock] Returning settings count');
                    await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' } });
                } else if (method === 'PATCH' || method === 'POST' || method === 'PUT') {
                    console.log('[Mock] Saving settings');
                    await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
                }
            } else if (url.includes('trips')) {
                if (method === 'GET') {
                    console.log('[Mock] Returning trips data');
                    await route.fulfill({
                        status: 200,
                        headers: { 'content-range': '0-1/2' },
                        body: JSON.stringify([
                            {
                                id: 'trip-1',
                                client_name: 'Juan Perez',
                                status: 'Pendiente',
                                cost: 150,
                                created_at: new Date().toISOString(),
                                businesses: { name: 'Empresa A' },
                                units: { name: 'Unidad 1', is_own: true },
                                drivers: { name: 'Chofer 1', license_plate: 'ABC-123', vehicle_model: 'Sedan' }
                            },
                            {
                                id: 'trip-2',
                                client_name: 'Maria Lopez',
                                status: 'En Progreso',
                                cost: 200,
                                created_at: new Date().toISOString(),
                                businesses: { name: 'Empresa B' },
                                units: { name: 'Unidad 2', is_own: false },
                                drivers: { name: 'Chofer 2', license_plate: 'XYZ-789', vehicle_model: 'SUV' }
                            }
                        ])
                    });
                } else if (method === 'DELETE') {
                    await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
                }
            } else if (url.includes('allowed_users')) {
                await route.fulfill({ status: 200, body: JSON.stringify([{ role: 'Administrador' }]) });
            } else {
                await route.fulfill({ status: 200, body: JSON.stringify([]) });
            }
        });

        // --- 1. SETTINGS: Standard Rate Configuration ---
        console.log('Probando Configuración de Tarifa Estándar...');
        await page.goto('/#/settings');
        await page.screenshot({ path: 'settings-load.png' });
        await expect(page.getByText('Configuración de Tarifa Estándar')).toBeVisible({ timeout: 15000 });
        await page.locator('input[type="number"]').first().fill('50');
        await page.getByRole('button', { name: /Guardar Cambios/i }).click();
        await expect(page.getByText(/guardada/i).first()).toBeVisible();

        // --- 2. MONITOR: Quick Rate Adjustments ---
        console.log('Probando Ajuste de Tarifa Rápida en Monitor...');
        await page.goto('/#/monitor');
        await page.getByRole('button', { name: /Nuevo Viaje/i }).click();
        await expect(page.getByText('Ajuste de Tarifa Rápida')).toBeVisible();

        // Verify values are loaded (from pricing settings mock)
        const baseRateInput = page.locator('input[type="number"]').nth(0);
        await expect(baseRateInput).toHaveValue('35');

        const kmRateInput = page.locator('input[type="number"]').nth(1);
        await expect(kmRateInput).toHaveValue('15');

        // Modify local pricing
        await baseRateInput.fill('100');
        await expect(baseRateInput).toHaveValue('100');

        // Reset local pricing
        await page.getByRole('button', { name: /Restablecer/i }).click();
        await expect(baseRateInput).toHaveValue('35');

        // --- 3. TRIPS: Bulk Deletion ---
        console.log('Probando Selección Múltiple y Eliminación en Trips...');
        await page.goto('/#/trips');
        // Wait for data to be visible
        await expect(page.getByText('Juan Perez')).toBeVisible({ timeout: 15000 });

        // Select the first trip row
        const firstRowCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]');
        await firstRowCheckbox.check({ force: true });

        // Take a screenshot to see if it's selected
        await page.screenshot({ path: 'trips-selected.png' });

        // Success button should appear (labeled as "Eliminar (1)")
        const bulkDeleteBtn = page.getByRole('button', { name: /Eliminar \(\d+\)/ });
        await expect(bulkDeleteBtn).toBeVisible({ timeout: 10000 });

        // Mock the confirm dialog
        page.on('dialog', dialog => dialog.accept());
        await bulkDeleteBtn.click();

        // Logout
        console.log('Verificando Logout...');
        await page.goto('/#/dashboard');
        await page.getByText('Salir').first().click();
        await expect(page).toHaveURL(/.*login/);
    });

});

