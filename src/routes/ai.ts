// Extraido de server.ts: los handlers se agruparon por dominio.
import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { requireAdmin } from "../services/serverAuth";

let genAIInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not defined. Please add it to your secrets.');
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAIInstance;
}

export function aiRoutes(): Router {
  const router = Router();

  router.post("/generate-product-image", requireAdmin, async (req, res) => {
    let { productName, productBrand } = req.body;
    if (!productName) {
      return res.status(400).json({ error: "Product name is required" });
    }

    // El texto entra en el prompt del modelo. Allowlist: solo letras, numeros,
    // espacio y puntuacion inocua. Asi caen comillas, backticks, barras y saltos
    // de linea, que son los que permiten reescribir la instruccion.
    const sanitizePrompt = (v: any) =>
      String(v).replace(/[^p{L}p{N} .,%&()+-]/gu, '').slice(0, 100).trim();
    productName = sanitizePrompt(productName);
    productBrand = productBrand ? sanitizePrompt(productBrand) : 'Kiosco';

    try {
      const ai = getGenAI();
      const stylePrompt = `A professional food or product advertising photorealistic studio catalog photograph of a single packaged "${productName}" by brand "${productBrand || 'Kiosco'}". Centered, placed on a very clean neutral studio countertop with custom professional dramatic warm studio product lighting. Appealing, clean minimalist advertising style, crisp realistic texture and packaging, 1:1 aspect ratio, high definition.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: stylePrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let base64Image = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }
      }

      if (base64Image) {
        return res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
      } else {
        let textResponse = "";
        if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.text) {
              textResponse += part.text;
            }
          }
        }
        return res.status(500).json({ 
          error: "Could not generate image bytes from candidate response.",
          details: textResponse 
        });
      }
    } catch (err: any) {
      console.warn("AI Image generation endpoint quota/error. Applying smart food fallback:", err.message);
    
      // Smart Unsplash fallback mapper
      const getFallbackStoreImage = (name: string, brand: string = ""): string => {
        const norm = `${name} ${brand}`.toLowerCase();
      
        if (norm.includes("cola") || norm.includes("coke") || norm.includes("pepsi") || norm.includes("sprite") || norm.includes("fanta") || norm.includes("gaseosa") || norm.includes("soda")) {
          return "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop"; // Cola
        }
        if (norm.includes("cerveza") || norm.includes("beer") || norm.includes("vino") || norm.includes("wine") || norm.includes("fernet") || norm.includes("branca") || norm.includes("alcohol") || norm.includes("bebida alc")) {
          return "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop"; // Wine / Drinks
        }
        if (norm.includes("agua") || norm.includes("villavicencio") || norm.includes("smartwater") || norm.includes("kin")) {
          return "https://images.unsplash.com/photo-1608885898957-a599fb15ec35?q=80&w=600&auto=format&fit=crop"; // Water
        }
        if (norm.includes("jugo") || norm.includes("cepita") || norm.includes("juice")) {
          return "https://images.unsplash.com/photo-1613478223719-2ab802602423?q=80&w=600&auto=format&fit=crop"; // Orange Juice
        }
        if (norm.includes("monster") || norm.includes("gatorade") || norm.includes("powerade") || norm.includes("energizante") || norm.includes("energy")) {
          return "https://images.unsplash.com/photo-1551326844-301bd9b21f92?q=80&w=600&auto=format&fit=crop"; // Sports Drinks
        }
        if (norm.includes("alfajor") || norm.includes("dulce") || norm.includes("rogel") || norm.includes("jorgito") || norm.includes("caramelo") || norm.includes("sugus") || norm.includes("mentita") || norm.includes("gomita")) {
          return "https://images.unsplash.com/photo-1508737804141-4c3b688e25be?q=80&w=600&auto=format&fit=crop"; // Treats / Alfajor / Candy
        }
        if (norm.includes("lays") || norm.includes("papas") || norm.includes("potato") || norm.includes("chips") || norm.includes("snack") || norm.includes("cheetos") || norm.includes("palitos")) {
          return "https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=600&auto=format&fit=crop"; // Chips & Snacks
        }
        if (norm.includes("oreo") || norm.includes("pepito") || norm.includes("cookies") || norm.includes("galletitas") || norm.includes("galleta") || norm.includes("criollitas")) {
          return "https://images.unsplash.com/photo-1558961309-dbd715c1390f?q=80&w=600&auto=format&fit=crop"; // Oreo / Cookies
        }
        if (norm.includes("chocolate") || norm.includes("milka") || norm.includes("toblerone") || norm.includes("cofler") || norm.includes("barrita")) {
          return "https://images.unsplash.com/photo-1511381939415-e44015466834?q=80&w=600&auto=format&fit=crop"; // Chocolate
        }
        if (norm.includes("leche") || norm.includes("lacteo") || norm.includes("yogur") || norm.includes("milk") || norm.includes("manteca")) {
          return "https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop"; // Milk / Dairy
        }
        if (norm.includes("jamon") || norm.includes("salame") || norm.includes("paleta") || norm.includes("fiambre") || norm.includes("mortadela")) {
          return "https://images.unsplash.com/photo-1524438418049-ab2acb7aa48f?q=80&w=600&auto=format&fit=crop"; // Ham / Meats
        }
        if (norm.includes("queso") || norm.includes("cheese") || norm.includes("cremoso") || norm.includes("pategras")) {
          return "https://images.unsplash.com/photo-1486299267070-83823f5448dd?q=80&w=600&auto=format&fit=crop"; // Cheese
        }
        if (norm.includes("pan") || norm.includes("medialuna") || norm.includes("factura") || norm.includes("panaderia") || norm.includes("facturas") || norm.includes("croissant") || norm.includes("lactal")) {
          return "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop"; // Bread / Bakery
        }
        if (norm.includes("detergente") || norm.includes("lavandina") || norm.includes("limpieza") || norm.includes("desinfectante") || norm.includes("jabon")) {
          return "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop"; // Cleaning/Hygiene
        }
        if (norm.includes("arroz") || norm.includes("fideo") || norm.includes("pasta") || norm.includes("aceite") || norm.includes("alimento") || norm.includes("cereales")) {
          return "https://images.unsplash.com/photo-1551462147-37885abb36f7?q=80&w=600&auto=format&fit=crop"; // Pasta / Grocery
        }
      
        const cleanName = encodeURIComponent(name.trim());
        return `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&auto=format&fit=crop&sig=${cleanName}`;
      };

      const fallbackUrl = getFallbackStoreImage(productName, productBrand);
      return res.json({ 
        imageUrl: fallbackUrl,
        fallbackUsed: true,
        errorNote: err.message || ""
      });
    }
  });

  return router;
}
