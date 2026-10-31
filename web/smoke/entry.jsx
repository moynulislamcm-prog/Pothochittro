import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "../src/lib/store.jsx";
import App from "../src/App.jsx";

/**
 * স্মোক টেস্টের এন্ট্রি — jsdom সেটআপের পরে ডাইনামিক ইমপোর্ট হয়,
 * তাই React/Leaflet লোডের আগেই ব্রাউজার গ্লোবালগুলো তৈরি থাকে।
 *
 * এখানে আসল App ট্রি (SiteLayout + রাউট + AdminLayout) রেন্ডার করা হয়,
 * যাতে ব্যবহারকারী যা দেখবেন ঠিক সেটাই পরীক্ষা হয়।
 */
export async function mount(route) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
  });

  // ডেটা লোড ও পরবর্তী ইফেক্ট শেষ হওয়া পর্যন্ত অপেক্ষা
  for (let i = 0; i < 15; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
  }

  return { container, root };
}

export async function unmount(root) {
  await act(async () => {
    root.unmount();
  });
}
