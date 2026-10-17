export type DemoFormState = {
  status: "idle" | "success";
  fieldErrors?: {
    name?: "required";
    email?: "required" | "email";
    phone?: "required" | "phone";
    message?: "max";
  };
  /** Present when persistence failed gracefully (no data was lost silently). */
  reason?: "db" | "unknown";
};

export const demoRequestInitialState: DemoFormState = {
  status: "idle",
  fieldErrors: {},
};
