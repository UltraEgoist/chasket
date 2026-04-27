/**
 * 結果オブジェクト。
 * 成功か失敗かを表すフラグと、成功時の値またはエラー情報を保持します。
 * @template T 成功時の値の型
 * @template E 失敗時のエラー情報の型
 * @property {boolean} isSuccess - 成功フラグ
 * @property {T} value - 成功時の値またはエラー情報
 * @property {E} error - 失敗時のエラー情報
 */
class Result {
    /** @type {boolean} 成功したか */
    #isSuccess;
    /** @type {T | E} 実際の値 */
    #value;

    /**
     * 
     * @param {boolean} isSuccess 
     * @param {T | E} value 
     */
    constructor(isSuccess, value) {
        this.#isSuccess = isSuccess;
        this.#value = value;
    }

    /**
     * 成功時のResultオブジェクトを生成する
     * @param {T} value 
     * @returns {Result<T, E>} 成功時のResultオブジェクト
     */
    static Ok(value) { 
        return new Result(true, value); 
    }

    /**
     * 失敗時のResultオブジェクトを生成する
     * @param {E} error 
     * @returns {Result<T, E>} 失敗時のResultオブジェクト
     */
    static Err(error) { 
        return new Result(false, error); 
    }

    /**
     * 新しい型を持つResultにラップし直すためのandThen
     * @template U
     * @param {(value: T) => Result<U, E>} fn 
     * @returns {Result<U, E>}
     */
    flatMap(fn) {
        return this.#isSuccess ? fn(this.#value) : this;
    }


    /**
     * 成功している場合の値を使用したmap
     * @template U
     * @param {(value: T) => U} fn 
     * @returns {Result<U, E>}
     */
    map(fn) {
        return this.#isSuccess ? Result.Ok(fn(this.#value)) : this;
    }

    /**
     * 失敗時の値を使用したmap
     * @template F 失敗時の新規の型
     * @param {(error: E) => F} fn
     * @returns {Result<T, F>}
     */
    mapError(fn) {
        return this.#isSuccess ? this : Result.Err(fn(this.#value));
    }

    /**
     * 成功時と失敗時とでそれぞれ共通の型に変換する
     * @template R
     * @param {(value: T) => R} onOk 
     * @param {(error: E) => R} onErr 
     * @returns {R}
     */
    fold(onOk, onErr) {
        return this.#isSuccess ? onOk(this.#value) : onErr(this.#value);
    }

    /**
     * 成功したかの結果を返す\
     * #TODO: Resultへの完全移行が完了次第削除予定
     * @returns {boolean} 失敗していたらtrue
     */
    isSuccess() {
        return this.#isSuccess;
    }
}





// ============================================================
// Exports
// ============================================================

module.exports = {
    Result
};
