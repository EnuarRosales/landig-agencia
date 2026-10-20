/**
 * Estado del formulario de solicitud de demostración para el hook `useActionState` de React 19.
 */
export type DemoFormState = {
  /** Estado de ciclo de vida del formulario: en espera/editando ("idle") o completado exitosamente ("success"). */
  status: "idle" | "success";
  /** Errores de validación específicos por campo para renderizar mensajes visuales en la interfaz. */
  fieldErrors?: {
    name?: "required";
    email?: "required" | "email";
    phone?: "required" | "phone";
    message?: "max";
  };
  /**
   * Causa específica cuando ocurre un fallo de persistencia o degradación elegante
   * (permite mostrar alertas amigables al usuario sin borrar sus datos ingresados).
   */
  reason?: "db" | "rate_limit" | "unknown";
};

/**
 * Estado inicial limpio del formulario de demostración antes de cualquier interacción del usuario.
 */
export const demoRequestInitialState: DemoFormState = {
  status: "idle",
  fieldErrors: {},
};
