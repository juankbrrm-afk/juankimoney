import type { ReactNode } from "react";
import type { Category } from "@/lib/data/places";

/**
 * Ilustraciones vectoriales propias por categoría — no fotografía real (ver nota en
 * apps/web/README.md sobre por qué: este entorno de desarrollo no tiene salida a internet
 * hacia bancos de imágenes, así que traer fotos reales de Panamá no es posible desde aquí
 * sin que alguien cambie el acceso de red o pase los archivos directo). Cada escena
 * referencia un lugar/paisaje real de Panamá (Casco Antiguo, el Canal, Taboga, Amador, el
 * Biomuseo) en vez de un ícono genérico — 100% autocontenido, cero requests externos,
 * reemplazar por `place.photo` real en cuanto exista fotografía de negocios.
 */
export function CategoryIllustration({ category, className = "" }: { category: Category; className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {SCENES[category]}
    </svg>
  );
}

const SCENES: Record<Category, ReactNode> = {
  // Isla Taboga: mar, sol, palmeras, un bote.
  beach: (
    <>
      <defs>
        <linearGradient id="beach-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe6f2" />
          <stop offset="100%" stopColor="#eaf6ee" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#beach-sky)" />
      <circle cx="320" cy="70" r="34" fill="#fbd67a" />
      <path d="M0,175 Q100,155 200,175 T400,175 V300 H0 Z" fill="#4fa9c9" opacity="0.9" />
      <path d="M0,205 Q100,190 200,205 T400,205 V300 H0 Z" fill="#3d94b4" />
      <path d="M0,245 H400 V300 H0 Z" fill="#e8d6ab" />
      <path d="M70,245 C68,205 45,175 20,168 C48,172 78,195 84,232 Z" fill="#3f6b4a" />
      <path d="M78,240 C82,198 112,172 140,168 C108,178 86,205 92,232 Z" fill="#3f6b4a" />
      <rect x="66" y="230" width="10" height="34" fill="#6b4a34" />
      <path d="M240,195 l40,0 l-6,14 l-30,0 Z" fill="#2c3b40" opacity="0.8" />
    </>
  ),
  // Casco Antiguo de noche: balcones coloniales, luces colgantes.
  restaurant: (
    <>
      <defs>
        <linearGradient id="rest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c2a3a" />
          <stop offset="100%" stopColor="#4a3d3a" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#rest-sky)" />
      <rect x="0" y="140" width="400" height="160" fill="#8a5a45" />
      <rect x="30" y="160" width="60" height="90" rx="4" fill="#f0c987" opacity="0.85" />
      <rect x="120" y="160" width="60" height="90" rx="4" fill="#f0c987" opacity="0.6" />
      <rect x="210" y="160" width="60" height="90" rx="4" fill="#f0c987" opacity="0.85" />
      <rect x="300" y="160" width="60" height="90" rx="4" fill="#f0c987" opacity="0.6" />
      <path d="M20,150 Q200,110 380,150" fill="none" stroke="#3a2e2b" strokeWidth="3" />
      {[40, 90, 140, 190, 240, 290, 340].map((x, i) => (
        <circle key={x} cx={x} cy={150 - Math.sin((i / 6) * Math.PI) * 34} r="5" fill="#f5cf7f" />
      ))}
    </>
  ),
  // Skyline al atardecer visto desde una terraza.
  rooftop: (
    <>
      <defs>
        <linearGradient id="roof-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b3f66" />
          <stop offset="55%" stopColor="#c96b4f" />
          <stop offset="100%" stopColor="#e8a45c" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#roof-sky)" />
      <circle cx="90" cy="60" r="26" fill="#fce8c9" opacity="0.9" />
      <g fill="#241a2b">
        <rect x="40" y="150" width="34" height="130" />
        <rect x="90" y="120" width="30" height="160" />
        <rect x="135" y="165" width="26" height="115" />
        <rect x="175" y="100" width="36" height="180" />
        <rect x="225" y="145" width="28" height="135" />
        <rect x="265" y="120" width="34" height="160" />
        <rect x="312" y="160" width="30" height="120" />
      </g>
      {[[100,140],[100,170],[185,120],[185,150],[185,180],[270,150],[270,180]].map(([x,y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="8" height="10" fill="#ffdd8a" opacity="0.9" />
      ))}
      <path d="M0,280 H400 V300 H0 Z" fill="#160f1a" />
      <path d="M20,265 Q200,240 380,265" fill="none" stroke="#160f1a" strokeWidth="3" />
      {[50,110,170,230,290,350].map((x) => <circle key={x} cx={x} cy={264} r="4" fill="#ffd88f" />)}
    </>
  ),
  // Casco / skyline de noche con luces de neón — vida nocturna.
  nightlife: (
    <>
      <defs>
        <linearGradient id="night-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171a33" />
          <stop offset="100%" stopColor="#2b2140" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#night-sky)" />
      <circle cx="330" cy="55" r="22" fill="#f4ecd8" opacity="0.9" />
      <circle cx="90" cy="90" r="60" fill="#e15b8a" opacity="0.22" />
      <circle cx="230" cy="140" r="70" fill="#5ad0c7" opacity="0.18" />
      <circle cx="300" cy="200" r="50" fill="#8b6ae0" opacity="0.2" />
      <g fill="#100c22">
        <rect x="30" y="170" width="30" height="110" />
        <rect x="70" y="140" width="26" height="140" />
        <rect x="110" y="190" width="34" height="90" />
        <rect x="155" y="120" width="28" height="160" />
        <rect x="195" y="160" width="30" height="120" />
        <rect x="235" y="100" width="32" height="180" />
        <rect x="278" y="150" width="26" height="130" />
        <rect x="315" y="175" width="30" height="105" />
      </g>
      {[[40,200],[75,165],[118,215],[163,150],[203,190],[243,140],[286,180]].map(([x,y], i) => (
        <rect key={i} x={x} y={y} width="7" height="9" fill={i % 2 ? "#ffd88f" : "#8be9e0"} opacity="0.9" />
      ))}
    </>
  ),
  // Esclusas de Miraflores: un barco cruzando el Canal.
  tour: (
    <>
      <defs>
        <linearGradient id="tour-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcdcea" />
          <stop offset="100%" stopColor="#8fc6d6" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#tour-sky)" />
      <rect x="0" y="190" width="400" height="110" fill="#3f7f8f" />
      <rect x="0" y="150" width="26" height="150" fill="#5a6b63" />
      <rect x="374" y="150" width="26" height="150" fill="#5a6b63" />
      <ellipse cx="200" cy="200" rx="115" ry="10" fill="#204a4f" opacity="0.3" />
      {/* casco del barco cruzando la esclusa */}
      <polygon points="95,196 95,178 130,160 285,160 300,178 300,196" fill="#e2402f" />
      <rect x="95" y="196" width="205" height="10" fill="#8f2f22" />
      <rect x="265" y="128" width="28" height="34" rx="2" fill="#e7e2d6" />
      <rect x="271" y="136" width="6" height="7" fill="#3f7f8f" />
      <rect x="281" y="136" width="6" height="7" fill="#3f7f8f" />
      <rect x="140" y="128" width="28" height="16" fill="#c94f3f" />
      <rect x="140" y="144" width="28" height="16" fill="#3f7f8f" />
      <rect x="176" y="122" width="28" height="16" fill="#e0a83c" />
      <rect x="176" y="138" width="28" height="16" fill="#4f8f5f" />
      <rect x="212" y="128" width="28" height="16" fill="#3f7f8f" />
      <rect x="212" y="144" width="28" height="16" fill="#c94f3f" />
      <path d="M0,192 H400 V198 H0 Z" fill="#eef4ee" opacity="0.6" />
    </>
  ),
  // Fachada colonial de hotel boutique en Casco Antiguo.
  hotel: (
    <>
      <defs>
        <linearGradient id="hotel-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe6c2" />
          <stop offset="100%" stopColor="#f5cf9b" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#hotel-sky)" />
      <rect x="0" y="60" width="400" height="240" fill="#d98a5f" />
      <rect x="40" y="90" width="320" height="16" fill="#7a4a34" />
      <path d="M90,130 a30,30 0 0 1 60,0 v70 h-60 Z" fill="#fdf3e2" />
      <path d="M250,130 a30,30 0 0 1 60,0 v70 h-60 Z" fill="#fdf3e2" />
      <rect x="170" y="150" width="60" height="90" fill="#6b4630" />
      <path d="M170,150 a30,30 0 0 1 60,0 Z" fill="#6b4630" />
      <circle cx="200" cy="195" r="4" fill="#f0c987" />
      <rect x="60" y="235" width="20" height="26" rx="3" fill="#3f6b4a" />
      <rect x="320" y="235" width="20" height="26" rx="3" fill="#3f6b4a" />
    </>
  ),
  // Biomuseo (Frank Gehry): techo multicolor angular.
  museum: (
    <>
      <defs>
        <linearGradient id="museo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbe9f2" />
          <stop offset="100%" stopColor="#f2ede0" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#museo-sky)" />
      <rect x="0" y="210" width="400" height="90" fill="#cfc3ab" />
      <polygon points="30,210 110,150 170,205 130,210" fill="#c94f3f" />
      <polygon points="120,210 190,140 250,200 210,210" fill="#e0a83c" />
      <polygon points="200,210 270,160 330,205 290,210" fill="#3f7f8f" />
      <polygon points="280,210 340,175 380,208 360,210" fill="#4f8f5f" />
      <rect x="60" y="210" width="280" height="8" fill="#3a3530" opacity="0.4" />
    </>
  ),
  // Parque Natural Metropolitano: dosel tropical y un perezoso.
  family: (
    <>
      <defs>
        <linearGradient id="park-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8ecd2" />
          <stop offset="100%" stopColor="#eef6e6" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#park-sky)" />
      <ellipse cx="90" cy="90" rx="90" ry="55" fill="#5a8f5a" opacity="0.9" />
      <ellipse cx="230" cy="60" rx="110" ry="60" fill="#487c4c" opacity="0.9" />
      <ellipse cx="340" cy="110" rx="80" ry="50" fill="#6ba05f" opacity="0.9" />
      <rect x="150" y="90" width="14" height="150" fill="#5b4632" />
      <path d="M164,140 q40,-10 60,10" fill="none" stroke="#5b4632" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="232" cy="150" rx="20" ry="16" fill="#8a7256" />
      <circle cx="240" cy="146" r="3" fill="#2c2820" />
      <path d="M212,150 q-10,20 0,34" fill="none" stroke="#8a7256" strokeWidth="7" strokeLinecap="round" />
      <path d="M252,150 q10,20 0,34" fill="none" stroke="#8a7256" strokeWidth="7" strokeLinecap="round" />
    </>
  ),
};
