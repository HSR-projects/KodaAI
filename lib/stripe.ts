import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
});

/** Prices in cents per month for each paid plan. */
export const PLAN_PRICES: Record<string, number> = {
  pro: 20000,  // $200
  max: 60000,  // $600
};

export const PLAN_NAMES: Record<string, string> = {
  pro: "Koda AI Pro",
  max: "Koda AI Max",
};

export const PLAN_DESCRIPTIONS: Record<string, string> = {
  pro: "Autonomous research agents, multi-step tasks, and stronger chess.",
  max: "Maximum depth — full-strength chess and the deepest research runs.",
};
