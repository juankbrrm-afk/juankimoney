import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CartProvider } from "@/hooks/useCart";
import { WishlistProvider } from "@/hooks/useWishlist";
import { UIProvider } from "@/hooks/useUI";
import { Home } from "@/pages/Home";

const Shop = lazy(() => import("@/pages/Shop").then((m) => ({ default: m.Shop })));
const ProductPage = lazy(() =>
  import("@/pages/ProductPage").then((m) => ({ default: m.ProductPage }))
);
const About = lazy(() => import("@/pages/About").then((m) => ({ default: m.About })));
const Journal = lazy(() =>
  import("@/pages/Journal").then((m) => ({ default: m.Journal }))
);
const Contact = lazy(() =>
  import("@/pages/Contact").then((m) => ({ default: m.Contact }))
);
const NotFound = lazy(() =>
  import("@/pages/NotFound").then((m) => ({ default: m.NotFound }))
);
const StudioPage = lazy(() =>
  import("@/studio/StudioPage").then((m) => ({ default: m.StudioPage }))
);

function App() {
  return (
    <UIProvider>
      <WishlistProvider>
        <CartProvider>
          <LoadingScreen />
          <Suspense fallback={null}>
            <Routes>
              {/* El estudio va fuera del Layout de la tienda: es pantalla completa. */}
              <Route path="studio" element={<StudioPage />} />
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="collection" element={<Shop />} />
                <Route path="shop" element={<Shop />} />
                <Route path="shop/:handle" element={<ProductPage />} />
                <Route path="about" element={<About />} />
                <Route path="journal" element={<Journal />} />
                <Route path="contact" element={<Contact />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </CartProvider>
      </WishlistProvider>
    </UIProvider>
  );
}

export default App;
