package vlm

import "errors"

// VideoRequestError records whether retrying the exact same stored video with
// the exact same model can recover. The wrapped error remains available to
// server logs and tracing, while callers can make a narrow retry decision
// without parsing provider text.
type VideoRequestError struct {
	err       error
	retryable bool
}

func (e *VideoRequestError) Error() string {
	if e == nil || e.err == nil {
		return "video request failed"
	}
	return e.err.Error()
}

func (e *VideoRequestError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

// RetryableVideoError marks a transient video failure. It is intentionally
// exported only as a constructor/classifier pair so transport details do not
// leak into the ingestion service.
func RetryableVideoError(err error) error {
	if err == nil {
		return nil
	}
	return &VideoRequestError{err: err, retryable: true}
}

func permanentVideoError(err error) error {
	if err == nil {
		return nil
	}
	return &VideoRequestError{err: err, retryable: false}
}

// IsRetryableVideoError reports whether a video provider failure is explicitly
// safe to retry with the same source object.
func IsRetryableVideoError(err error) bool {
	var classified *VideoRequestError
	return errors.As(err, &classified) && classified.retryable
}
