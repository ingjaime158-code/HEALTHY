import { test, expect } from '@playwright/test';

test.describe('Deep QA: Flujos Críticos', () => {

    test.beforeEach(async ({ page }) => {
        // Bypass login
        await page.addInitScript(() => {
            localStorage.setItem('cytio_current_user', 'qa_robot@cytio.com');
            localStorage.setItem('cytio_user_role', 'Administrador');
            localStorage.setItem('cytio_test_skip_auth_clear', 'true');
        });

        // Automatically accept any alerts that might pop up (like validation errors)
        // Also log them so we can see what went wrong in the console
        page.on('dialog', dialog => {
            console.log(`DIALOG APPEARED: ${dialog.message()}`);
            dialog.accept();
        });
    });

    test('Monitor: Crear y Finalizar Viaje', async ({ page }) => {
        // Navigate to Monitor
        await page.goto('/#/monitor');
        await expect(page.getByRole('button', { name: 'Nuevo Viaje' })).toBeVisible({ timeout: 15000 });

        // Click to open New Trip Sidebar
        await page.getByRole('button', { name: 'Nuevo Viaje' }).click();

        // Wait for inputs to be visible
        await expect(page.getByRole('textbox', { name: 'Calle' }).first()).toBeVisible();

        // Fill Origin Structured Form
        await page.getByRole('combobox').filter({ hasText: 'Municipio' }).selectOption({ label: 'Monterrey' });
        await page.getByRole('textbox', { name: 'Colonia / Fracc.' }).fill('Centro');
        await page.getByRole('textbox', { name: 'Calle' }).fill('Zaragoza');
        await page.getByRole('button', { name: 'Buscar y Fijar' }).first().click();

        // **CRITICAL FIX**: Wait for Google Maps geocoding to resolve origin before switching tabs
        await expect(page.getByText(/Lat: -?\d+/)).toBeVisible({ timeout: 10000 });

        // Switch to Destino
        await page.getByRole('button', { name: 'Destino' }).click();

        // Fill Destination Structured Form
        await page.getByRole('combobox').filter({ hasText: 'Municipio' }).selectOption({ label: 'San Pedro Garza García' });
        await page.getByRole('textbox', { name: 'Colonia / Fracc.' }).fill('Valle Oriente');
        await page.getByRole('textbox', { name: 'Calle' }).fill('Batallon');
        await page.getByRole('button', { name: 'Buscar y Fijar' }).last().click();

        // **CRITICAL FIX**: Wait for Google Maps geocoding to resolve destination
        await expect(page.getByText(/Lat: -?\d+/)).toBeVisible({ timeout: 10000 });

        // Fill passenger info
        const nameInput = page.getByRole('textbox', { name: 'Nombre del pasajero' });
        await expect(nameInput).toBeVisible();
        await nameInput.fill('QA Robot Passenger');

        // Submit Trip
        await page.getByRole('button', { name: 'Confirmar y Crear Viaje' }).click();

        // Wait until it appears in the trip list (should show 'En Progreso')
        // Using locator more flexibly to handle potential markup trees
        await expect(page.getByText('QA Robot Passenger')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('En Progreso').first()).toBeVisible({ timeout: 15000 });

        // We want to finish the trip
        const finishButton = page.getByRole('button', { name: 'Finalizar Carrera' }).first();
        await finishButton.scrollIntoViewIfNeeded();
        await finishButton.click();

        // Verification: Payment Ticket appears and can be closed
        await expect(page.getByText('Comprobante de Viaje')).toBeVisible({ timeout: 10000 });
        await page.getByRole('button', { name: 'Cerrar' }).click();

        // Verification: Modal disappears
        await expect(page.getByText('Comprobante de Viaje')).toBeHidden();
    });

});
