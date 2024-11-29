const init = () => {
    // Manually implement necessary set operations
    Set.prototype.union = function (b) {
        for (const elem of b) {
            this.add(elem);
        }
        return this;
    };
    Set.prototype.intersect = function (b) {
        for (const elem of this) {
            if (!b.has(elem)) {
                this.delete(elem);
            }
        }
        return this;
    };
    Set.prototype.difference = function (b) {
        for (const elem of this) {
            if (b.has(elem)) {
                this.delete(elem);
            }
        }
        return this;
    };
};

export default init;