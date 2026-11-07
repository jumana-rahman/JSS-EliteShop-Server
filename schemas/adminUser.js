import { z } from "zod";

export const userStatusSchema = z.object({
  isActive: z.boolean({ error: "Choose an account status." }),
});
