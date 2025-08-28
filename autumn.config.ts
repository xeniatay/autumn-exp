import { feature, product, featureItem, priceItem } from "atmn";

/**
 * Define a single feature called "messages"
 */
export const messages = feature({
  id: "messages",
  name: "Messages",
  type: "single_use", // usage counted one by one
});

/**
 * Free plan:
 * - 5 messages included each month
 */
export const free = product({
  id: "free",
  name: "Free",
  items: [
    featureItem({
      feature_id: messages.id,
      included_usage: 5,
      interval: "month",
    }),
  ],
});

/**
 * Pro plan:
 * - 100 messages included each month
 * - $20 / month subscription
 */
export const pro = product({
  id: "pro",
  name: "Pro",
  items: [
    featureItem({
      feature_id: messages.id,
      included_usage: 100,
      interval: "month",
    }),
    priceItem({
      price: 2000,        // amount in cents ($20.00)
      interval: "month",  // recurring monthly subscription
    }),
  ],
});
