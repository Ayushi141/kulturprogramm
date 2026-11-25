/** Upper limits per contact-form field, so that one request cannot fill the database. */
export const CONTACT_LIMITS = { name: 200, email: 320, message: 5000 } as const
