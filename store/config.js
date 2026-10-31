// Store settings. Edit this file only; the pages read everything from here.
window.STORE = {
  brand: "Stillwag",
  currency: "USD",
  freeShippingAt: 50,
  subscribeDiscount: 0.15,

  // Real checkout through Shopify: fill in your store domain and each
  // variant's numeric ID (Shopify admin > Products > product > variant, the
  // number at the end of the URL). When these are set, "Checkout" sends the
  // cart straight to Shopify's checkout. Until then the built-in checkout
  // page runs in test mode and takes no payment.
  shopifyDomain: "",          // e.g. "3ck0q1-nn.myshopify.com"

  products: {
    "joint-1": { name: "Hip & Joint Chews", sub: "1 bottle, 90 chews (30 days)", price: 42, compare: 59, img: "https://d8j0ntlcm91z4.cloudfront.net/user_3LMEa94o5UZbP1EPxUj6FdXMUbo/hf_20261031_161311_1759379f-8994-4794-8c0f-8d327daec9e9.png", shopifyVariant: "" },
    "joint-3": { name: "Hip & Joint Chews, 3-pack", sub: "3 bottles (90 days)", price: 99, compare: 177, img: "https://d8j0ntlcm91z4.cloudfront.net/user_3LMEa94o5UZbP1EPxUj6FdXMUbo/hf_20261031_161617_e40e2134-8953-4ed4-9928-1451dc391c1a.png", shopifyVariant: "" },
    "joint-6": { name: "Hip & Joint Chews, 6-pack", sub: "6 bottles (180 days)", price: 174, compare: 354, img: "https://d8j0ntlcm91z4.cloudfront.net/user_3LMEa94o5UZbP1EPxUj6FdXMUbo/hf_20261031_161617_e40e2134-8953-4ed4-9928-1451dc391c1a.png", shopifyVariant: "" },
    "probiotic": { name: "Gut Probiotic Chews", sub: "1 bottle, 60 chews", price: 24, compare: 32, img: "https://d8j0ntlcm91z4.cloudfront.net/user_3LMEa94o5UZbP1EPxUj6FdXMUbo/hf_20261031_161617_8682ca24-f38d-476d-8fc7-c98b1bcb5dc5.png", shopifyVariant: "" }
  }
};
