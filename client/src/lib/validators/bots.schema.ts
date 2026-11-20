import { z } from "zod";

const APP_NAME_REGEX = /^[a-z0-9-]{3,40}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const deployBotSchema = z.object({
  app_name: z
    .string()
    .trim()
    .regex(
      APP_NAME_REGEX,
      "App name must be 3-40 lowercase letters, numbers, and hyphens only"
    ),
  session_id: z.string().trim().min(1, "Session ID is required"),
  days: z.number().int().positive("Select a valid pricing duration"),
  custom_name: z
    .string()
    .trim()
    .max(100, "Custom name must be at most 100 characters")
    .optional()
    .or(z.literal("")),
  template_id: z
    .string()
    .trim()
    .refine((val) => val === "" || UUID_REGEX.test(val), {
      message: "Template ID must be a valid UUID",
    })
    .optional(),
});

export const recoverBotSchema = z
  .object({
    app_name: z
      .string()
      .trim()
      .refine((val) => val === "" || APP_NAME_REGEX.test(val), {
        message: "App name must be 3-40 lowercase letters, numbers, and hyphens",
      })
      .optional(),
    bot_id: z.string().trim().optional(),
    session_id: z.string().trim().optional(),
    custom_name: z.string().trim().max(100).optional(),
  })
  .refine((data) => Boolean(data.app_name || data.bot_id || data.session_id), {
    message: "Provide at least one of App Name, Bot ID, or Session ID",
    path: ["app_name"],
  });

export type DeployBotFormValues = z.infer<typeof deployBotSchema>;
export type RecoverBotFormValues = z.infer<typeof recoverBotSchema>;

