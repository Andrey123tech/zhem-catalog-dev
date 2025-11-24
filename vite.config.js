import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        product: 'product.html',
        order: 'order.html',
        orderItem: 'order_item.html',
        catalog: 'catalog.html'
      }
    }
  }
});