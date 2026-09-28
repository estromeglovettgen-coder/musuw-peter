#!/bin/sh
# Shared, value-safe contract for Paddle's public and server-only runtime
# inputs. Callers source this file so API keys never appear in process args.
# Price IDs and notification secrets do not encode their Paddle environment;
# provider-side catalog reads and a signed delivery remain the final proof that
# those values belong to the selected environment.

musuw_paddle_contract_reject() {
    printf '%s\n' "$1" >&2
    return 1
}

musuw_paddle_validate_configuration() {
    if [ "$#" -ne 10 ]; then
        musuw_paddle_contract_reject 'Paddle configuration must include one environment, both credentials, and six prices'
        return 1
    fi

    case "$1" in
        sandbox)
            case "$2" in
                test_?*) ;;
                *)
                    musuw_paddle_contract_reject 'Paddle Sandbox requires a test client token'
                    return 1
                    ;;
            esac
            case "$3" in
                pdl_sdbx_apikey_?*) ;;
                *)
                    musuw_paddle_contract_reject 'Paddle Sandbox requires a Sandbox API key'
                    return 1
                    ;;
            esac
            ;;
        live)
            case "$2" in
                live_?*) ;;
                *)
                    musuw_paddle_contract_reject 'Paddle Live requires a live client token'
                    return 1
                    ;;
            esac
            case "$3" in
                pdl_live_apikey_?*) ;;
                *)
                    musuw_paddle_contract_reject 'Paddle Live requires a Live API key'
                    return 1
                    ;;
            esac
            ;;
        *)
            musuw_paddle_contract_reject 'MUSUW_PADDLE_ENVIRONMENT must be sandbox or live'
            return 1
            ;;
    esac

    case "$4" in
        pdl_ntfset_?*) ;;
        *)
            musuw_paddle_contract_reject 'Paddle webhook secret must belong to a notification destination'
            return 1
            ;;
    esac

    shift 4
    musuw_paddle_seen_prices='|'
    for musuw_paddle_price_id in "$@"; do
        case "$musuw_paddle_price_id" in
            pri_?*) ;;
            *)
                unset musuw_paddle_seen_prices musuw_paddle_price_id
                musuw_paddle_contract_reject 'Paddle configuration requires six valid price identifiers'
                return 1
                ;;
        esac
        case "$musuw_paddle_seen_prices" in
            *"|$musuw_paddle_price_id|"*)
                unset musuw_paddle_seen_prices musuw_paddle_price_id
                musuw_paddle_contract_reject 'Paddle configuration requires six distinct price identifiers'
                return 1
                ;;
        esac
        musuw_paddle_seen_prices="${musuw_paddle_seen_prices}${musuw_paddle_price_id}|"
    done
    unset musuw_paddle_seen_prices musuw_paddle_price_id
}

# Musuw's fixed production overlay is intentionally narrower than the generic
# Paddle adapter. Production is one complete Live unit; Sandbox remains valid
# only through the generic development/test adapter.
musuw_paddle_validate_production_launch() {
    if [ "$#" -ne 10 ]; then
        musuw_paddle_contract_reject 'Paddle production launch configuration is incomplete'
        return 1
    fi
    if [ "$1" != 'live' ]; then
        musuw_paddle_contract_reject 'Musuw production launch requires Paddle Live'
        return 1
    fi
    musuw_paddle_validate_configuration "$@"
}
