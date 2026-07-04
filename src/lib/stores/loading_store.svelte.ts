export const loadingStore = new class {
    is_loading = $state(false);
    message = $state("");

    start(msg: string = "Loading...") {
        this.message = msg;
        this.is_loading = true;
    }

    stop() {
        this.is_loading = false;
        this.message = "";
    }
}();
