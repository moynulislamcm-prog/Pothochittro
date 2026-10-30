import { Navigate, Route, Routes } from "react-router-dom";
import SiteLayout from "./components/SiteLayout.jsx";
import AdminLayout from "./admin/AdminLayout.jsx";
import Home from "./pages/Home.jsx";
import Districts from "./pages/Districts.jsx";
import DistrictDetail from "./pages/DistrictDetail.jsx";
import Places from "./pages/Places.jsx";
import Distance from "./pages/Distance.jsx";
import MyTravel from "./pages/MyTravel.jsx";
import PlacePage from "./pages/PlacePage.jsx";

export default function App() {
  return (
    <Routes>
      {/* এডমিন প্যানেল — আলাদা লেআউট, আলাদা লগইন গেট */}
      <Route path="/admin/*" element={<AdminLayout />} />

      {/* মূল সাইট */}
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/districts" element={<Districts />} />
        <Route path="/districts/:id" element={<DistrictDetail />} />
        <Route path="/places" element={<Places />} />
        {/* প্রতিটি গন্তব্যের নিজস্ব URL — SEO-র মূল ভিত্তি */}
        <Route path="/places/:slug" element={<PlacePage />} />
        <Route path="/distance" element={<Distance />} />
        <Route path="/my-travel" element={<MyTravel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
