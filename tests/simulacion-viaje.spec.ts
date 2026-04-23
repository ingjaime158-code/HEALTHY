import { test, expect } from '@playwright/test';

// Configurar permisos de geolocalización para todo el test
test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 25.6866, longitude: -100.3161 }
});

test('Flujo Completo: Creación, Simulación y Finalización de Viaje', async ({ page, context }) => {
    // 1. Abrir Monitor como Despachador
    console.log('Navegando al Monitor...');
    await page.goto('http://localhost:3000/#/monitor', { waitUntil: 'domcontentloaded' });

    // 2. Abrir Modal de Nuevo Viaje
    console.log('Buscando botón nuevo viaje...');
    await page.getByRole('button', { name: 'Nuevo Viaje' }).click();

    // 3. Llenar Formulario
    console.log('Llenando formulario de viaje...');

    // Origen
    const originInput = page.getByPlaceholder('Buscar dirección de origen...');
    await originInput.click();
    await originInput.fill('Monterrey Centro');
    await page.waitForTimeout(2000); // Dar más tiempo al autocomplete
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Destino
    const destInput = page.getByPlaceholder('Buscar dirección de destino...');
    await destInput.click();
    await destInput.fill('Parque Fundidora');
    await page.waitForTimeout(2000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Datos Pasajero
    await page.getByPlaceholder('Nombre').fill('Test Automático Playwright');
    await page.getByPlaceholder('1234567890').fill('8181818181');

    // Crear
    console.log('Confirmando viaje...');
    await page.getByRole('button', { name: 'Confirmar y Crear Viaje' }).click();

    // 4. Capturar el Toast de éxito y abrir el link de conductor
    console.log('Esperando confirmación (Toast)...');
    const toast = page.locator('text=Viaje Creado');
    await expect(toast).toBeVisible({ timeout: 15000 });

    // "Ver Detalles" abre una nueva pestaña
    console.log('Abriendo link de conductor...');
    const pagePromise = context.waitForEvent('page');
    const link = page.getByText('Ver Detalles');

    // A veces el toast desaparece rápido, aseguramos click
    await link.click();

    const driverPage = await pagePromise;
    console.log('Pestaña de conductor abierta. Esperando carga...');
    await driverPage.waitForLoadState('domcontentloaded');

    // 5. Validar carga y activar Simulación
    // Esperamos a que el botón de simulación esté habilitado
    // Botón puede decir "Modo Simulación (Ruta)" o "Modo Simulación (Básico)"
    const simButton = driverPage.locator('button', { hasText: /Simula/i });
    console.log('Buscando botón de simulación...');
    await expect(simButton).toBeVisible({ timeout: 20000 });

    // Verificar texto del botón para asegurar que la ruta cargó (opcional, pero buena práctica)
    const btnText = await simButton.textContent();
    console.log(`Botón encontrado: "${btnText}"`);

    console.log('Iniciando Simulación...');
    await simButton.click();

    // 6. Validar Estado "En Vivo"
    await expect(driverPage.locator('text=En Vivo')).toBeVisible();
    console.log('Simulación activa. Esperando movimiento del vehículo (5s)...');

    // Esperar unos segundos para ver el movimiento
    await driverPage.waitForTimeout(5000);

    // 7. Finalizar Viaje
    console.log('Finalizando viaje...');
    const finishButton = driverPage.locator('button', { hasText: 'Finalizar Viaje' });
    await finishButton.click();

    // 8. Validación Final de Éxito
    console.log('Verificando pantalla de éxito...');
    await expect(driverPage.locator('text=¡Viaje Finalizado!')).toBeVisible();

    // Asegurar que el overlay de error NO está presente
    const errorOverlay = driverPage.locator('.material-symbols-outlined', { hasText: 'error_outline' });
    await expect(errorOverlay).not.toBeVisible();

    console.log('¡Prueba E2E Completada con Éxito!');
});
