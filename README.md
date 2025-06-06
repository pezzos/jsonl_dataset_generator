# JSONL Dataset Generator for LLM Fine-tuning

Generate rich JSONL datasets from topics to fine-tune Large Language Models. This tool transforms topics into diverse Q&A pairs by leveraging multiple AI providers to ensure variety and quality in training data.

## About the Author

[Alexandre Pezzotta](https://github.com/pezzos) - Engineer passionate about AI and automation. Feel free to check out my other projects on GitHub!

## Features

- Topic-based dataset generation
- Automatic question generation from topics
- Multiple AI provider support for diverse answers:
  - OpenAI
  - Anthropic
  - Google
- JSONL export for direct fine-tuning
- Web interface for easy dataset management
- Docker support for seamless deployment

## Quick Start

This project requires **Node.js 20** or later.

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your AI provider keys
3. Run with Docker:
   ```bash
   docker-compose up
   ```

Or run locally:
```bash
npm install
npm start
```

## Testing

Run the automated test suite with:

```bash
npm test
```

## How It Works

1. Input topics or knowledge areas
2. The system generates relevant questions
3. Multiple AI providers generate varied answers
4. Results are formatted into JSONL for fine-tuning
5. Export your dataset ready for training

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
To check code style run:

```bash
npx eslint src
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and improvements.

## License

MIT - See [LICENSE](LICENSE) for details.
