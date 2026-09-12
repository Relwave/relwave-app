import { useState, useEffect } from "react";

export function useWelcomeMessage(): string {
  const texts = [
    "Welcome to Relwave",
    "Good to see you again!",
    "Ready to dive into your data?",
    "Your database companion awaits!",
    "Let’s explore your data together!",
  ];
  const ttl = 3 * 60 * 60 * 1000; // 3 hours
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("welcomeMessage");

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const now = Date.now();

        if (now < parsed.expiry) {
          setMessage(parsed.value);
          return;
        } else {
          localStorage.removeItem("welcomeMessage");
        }
      } catch {
        localStorage.removeItem("welcomeMessage");
      }
    }

    // Pick a random message
    const randomText = texts[Math.floor(Math.random() * texts.length)];

    const item = {
      value: randomText,
      expiry: Date.now() + ttl,
    };

    localStorage.setItem("welcomeMessage", JSON.stringify(item));
    setMessage(randomText);
  }, [texts, ttl]);

  return message;
}
