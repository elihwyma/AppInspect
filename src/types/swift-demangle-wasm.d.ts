declare module "swift-demangle-wasm/dist/index.browser.js" {
	export interface InitializeOptions {
		module?: WebAssembly.Module | BufferSource | Response;
	}
	export default function initialize(
		options?: InitializeOptions
	): Promise<(name: string) => string>;
}
