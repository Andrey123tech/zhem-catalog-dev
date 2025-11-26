// Жемчужина · данные каталога (Vite + JSON)

// Импортируем все модели из JSON (файл src/products.json)
import PRODUCTS from "./products.json";

// Размерная линейка колец: 15.0–23.5 с шагом 0.5
const SIZES = [];
for (let v = 15.0; v <= 23.5; v += 0.5) {
  SIZES.push(v.toFixed(1));
}

// Размерная линейка браслетов
const BRACELET_SIZES = ["17.0", "18.0", "19.0"];

export { PRODUCTS, SIZES, BRACELET_SIZES };

