package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
)

const zaiSpeechEndpoint = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"

// TranscribeAudio sends an audio file to Z.AI (ZhipuAI) for speech-to-text transcription.
// language: "pt" for Portuguese, "en" for English, etc.
// Returns the transcribed text.
func TranscribeAudio(apiKey, audioPath, language string) (string, error) {
	f, err := os.Open(audioPath)
	if err != nil {
		return "", fmt.Errorf("cannot open audio file: %w", err)
	}
	defer f.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// file field
	part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return "", fmt.Errorf("cannot create form file: %w", err)
	}
	if _, err = io.Copy(part, f); err != nil {
		return "", fmt.Errorf("cannot write audio to form: %w", err)
	}

	// model field — glm-4-voice is ZhipuAI's speech model
	writer.WriteField("model", "glm-4-voice")

	// language hint
	if language != "" {
		writer.WriteField("language", language)
	}

	writer.Close()

	req, err := http.NewRequest(http.MethodPost, zaiSpeechEndpoint, &body)
	if err != nil {
		return "", fmt.Errorf("cannot create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Z.AI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Z.AI API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("cannot parse Z.AI response: %w", err)
	}

	return result.Text, nil
}

// GetZAIAPIKey reads ZAI_API_KEY from the environment.
func GetZAIAPIKey() string {
	return os.Getenv("ZAI_API_KEY")
}
