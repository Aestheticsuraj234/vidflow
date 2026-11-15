import {z} from 'zod';

/** Minimum password length, enforced on both the client and the server. */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum password length. Better Auth rejects anything longer. */
export const PASSWORD_MAX_LENGTH = 128;

// Trim and lowercase first, then validate, so " A@B.co " is accepted.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({message: 'Enter a valid email address'}));

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {message: `Use at least ${PASSWORD_MIN_LENGTH} characters`})
  .max(PASSWORD_MAX_LENGTH, {message: `Use at most ${PASSWORD_MAX_LENGTH} characters`});

/** Fields of the sign-up form. */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, {message: 'Enter your name'}).max(100),
  email,
  password,
});

/** Fields of the sign-in form. */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, {message: 'Enter your password'}),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
