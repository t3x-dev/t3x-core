// vitest.config.mts
import swc from "file:///Users/pdx/work/T3X/.worktrees/realtime-sync-mcp/node_modules/.pnpm/unplugin-swc@1.5.9_@swc+core@1.15.18_rollup@4.54.0/node_modules/unplugin-swc/dist/index.js";
import { defineConfig } from "file:///Users/pdx/work/T3X/.worktrees/realtime-sync-mcp/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.27_jsdom@28.0.0_lightningcss@1.30.2/node_modules/vitest/dist/config.js";
var vitest_config_default = defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/golden/**", "src/__tests__/benchmarks/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**", "src/**/*.bench.ts"]
    },
    // Tests are stateless — no need for per-file process isolation
    isolate: false,
    // Longer timeout for async operations
    testTimeout: 1e4,
    // Limit parallel workers to prevent memory exhaustion
    minWorkers: 1,
    maxWorkers: 4
  },
  bench: {
    globals: true,
    include: ["src/**/*.bench.ts"]
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy5tdHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvcGR4L3dvcmsvVDNYLy53b3JrdHJlZXMvcmVhbHRpbWUtc3luYy1tY3AvcGFja2FnZXMvY29yZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3BkeC93b3JrL1QzWC8ud29ya3RyZWVzL3JlYWx0aW1lLXN5bmMtbWNwL3BhY2thZ2VzL2NvcmUvdml0ZXN0LmNvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3BkeC93b3JrL1QzWC8ud29ya3RyZWVzL3JlYWx0aW1lLXN5bmMtbWNwL3BhY2thZ2VzL2NvcmUvdml0ZXN0LmNvbmZpZy5tdHNcIjtpbXBvcnQgc3djIGZyb20gJ3VucGx1Z2luLXN3Yyc7XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3N3Yy52aXRlKCldLFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBlbnZpcm9ubWVudDogJ25vZGUnLFxuICAgIGluY2x1ZGU6IFsnc3JjLyoqLyoudGVzdC50cyddLFxuICAgIGV4Y2x1ZGU6IFsnc3JjL19fdGVzdHNfXy9nb2xkZW4vKionLCAnc3JjL19fdGVzdHNfXy9iZW5jaG1hcmtzLyoqJ10sXG4gICAgY292ZXJhZ2U6IHtcbiAgICAgIHByb3ZpZGVyOiAndjgnLFxuICAgICAgcmVwb3J0ZXI6IFsndGV4dCcsICdqc29uJywgJ2h0bWwnXSxcbiAgICAgIGluY2x1ZGU6IFsnc3JjLyoqLyoudHMnXSxcbiAgICAgIGV4Y2x1ZGU6IFsnc3JjLyoqLyoudGVzdC50cycsICdzcmMvX190ZXN0c19fLyoqJywgJ3NyYy8qKi8qLmJlbmNoLnRzJ10sXG4gICAgfSxcbiAgICAvLyBUZXN0cyBhcmUgc3RhdGVsZXNzIFx1MjAxNCBubyBuZWVkIGZvciBwZXItZmlsZSBwcm9jZXNzIGlzb2xhdGlvblxuICAgIGlzb2xhdGU6IGZhbHNlLFxuICAgIC8vIExvbmdlciB0aW1lb3V0IGZvciBhc3luYyBvcGVyYXRpb25zXG4gICAgdGVzdFRpbWVvdXQ6IDEwMDAwLFxuICAgIC8vIExpbWl0IHBhcmFsbGVsIHdvcmtlcnMgdG8gcHJldmVudCBtZW1vcnkgZXhoYXVzdGlvblxuICAgIG1pbldvcmtlcnM6IDEsXG4gICAgbWF4V29ya2VyczogNCxcbiAgfSxcbiAgYmVuY2g6IHtcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIGluY2x1ZGU6IFsnc3JjLyoqLyouYmVuY2gudHMnXSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrWCxPQUFPLFNBQVM7QUFDbFksU0FBUyxvQkFBb0I7QUFFN0IsSUFBTyx3QkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDO0FBQUEsRUFDcEIsTUFBTTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBUyxDQUFDLGtCQUFrQjtBQUFBLElBQzVCLFNBQVMsQ0FBQywyQkFBMkIsNkJBQTZCO0FBQUEsSUFDbEUsVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUyxDQUFDLGFBQWE7QUFBQSxNQUN2QixTQUFTLENBQUMsb0JBQW9CLG9CQUFvQixtQkFBbUI7QUFBQSxJQUN2RTtBQUFBO0FBQUEsSUFFQSxTQUFTO0FBQUE7QUFBQSxJQUVULGFBQWE7QUFBQTtBQUFBLElBRWIsWUFBWTtBQUFBLElBQ1osWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFNBQVM7QUFBQSxJQUNULFNBQVMsQ0FBQyxtQkFBbUI7QUFBQSxFQUMvQjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
