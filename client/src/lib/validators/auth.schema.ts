import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9_-]{3,32}$/,
      "Username must be 3-32 characters (letters, numbers, underscores, hyphens)"
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

