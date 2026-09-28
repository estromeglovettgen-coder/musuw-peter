package types

import (
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/utils"
)

// encryptStoredSecretStrict is the write-side security boundary for secrets
// embedded in JSON/JSONB value objects. A non-empty plaintext secret must never
// degrade to plaintext persistence when SYSTEM_AES_KEY is missing or encryption
// fails. Read-side scanners remain deliberately lenient so an operator can
// still load and repair rows after a key rotation problem.
func encryptStoredSecretStrict(field, value string) (string, error) {
	if value == "" || strings.HasPrefix(value, utils.EncPrefix) {
		return value, nil
	}
	key := utils.GetAESKey()
	if key == nil {
		return "", fmt.Errorf("%s: SYSTEM_AES_KEY must contain exactly 32 bytes before persisting secrets", field)
	}
	encrypted, err := utils.EncryptAESGCM(value, key)
	if err != nil {
		return "", fmt.Errorf("%s: encrypt stored secret: %w", field, err)
	}
	if encrypted == value || !strings.HasPrefix(encrypted, utils.EncPrefix) {
		return "", fmt.Errorf("%s: encryption did not produce encrypted storage", field)
	}
	return encrypted, nil
}
