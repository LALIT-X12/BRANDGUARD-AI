# 🛡️ BrandGuard AI

**AI-Powered Brand Safety, Content Governance & Risk Detection Platform**

BrandGuard AI is an AI-powered platform designed to detect misleading, unsafe, unsupported, and potentially harmful claims in brand content. It helps teams identify content risks, understand why content is flagged, and improve content before publication.

The platform combines AI-powered analysis with an explainable risk dashboard and a review workflow.

---

## ✨ Key Features

- **AI-Powered Detection:** Uses Google Gemini to analyze content and identify potentially risky claims.
- **Explainable Risk Analysis:** Displays detected issues, severity levels, evidence, confidence, and rule information.
- **Content Review Workflow:** Submit content, run reviews, and inspect detected findings.
- **Risk Dashboard:** View and monitor content issues through the frontend.
- **Backend API:** FastAPI-based services for processing requests and managing review workflows.
- **Database Integration:** MongoDB support for storing application data.
- **Containerized Setup:** Docker Compose support for running the application services.

---

## 🏗️ Project Architecture

BrandGuard AI consists of three main application components:

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React, TypeScript, Vite | User interface and risk dashboard |
| Backend | Python, FastAPI | API and review orchestration |
| AI Service | Python, FastAPI, Google Gemini | AI-powered content analysis |
| Database | MongoDB | Data storage |
| Containers | Docker, Docker Compose | Application deployment |

### Application Flow

1. User submits brand content through the frontend.
2. The backend receives the submission.
3. The backend communicates with the AI service.
4. Google Gemini analyzes the submitted content.
5. Potential risks and findings are returned.
6. The dashboard displays the findings with explanations and severity information.

---

## 📁 Project Structure

```text
BRANDGUARD-AI/
│
├── app/
│   ├── clients/
│   ├── core/
│   ├── services/
│   └── ...
│
├── backend/
│   ├── app/
│   ├── tests/
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── datasets/
├── docs/
├── scripts/
├── tests/
│
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## ⚙️ Prerequisites

Install the following before running the project:

- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- [Python](https://www.python.org/downloads/) — required for local Python development
- [Node.js](https://nodejs.org/) and npm — required for frontend development
- A Google Gemini API key

Make sure Docker Desktop is running before starting the containerized application.

---

## 🚀 Installation and Setup

### Step 1: Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/LALIT-X12/BRANDGUARD-AI.git
```

Navigate into the project directory:

```bash
cd BRANDGUARD-AI
```

### Step 2: Configure environment variables

Create your local environment file using the example file:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Linux / macOS:**

```bash
cp .env.example .env
```

Open the `.env` file and configure the required environment variables.

Add your own Google Gemini API key in the appropriate variable.

You can obtain a Gemini API key from:

https://aistudio.google.com/apikey

If you are developing the backend separately, also inspect:

```text
backend/.env.example
```

Create and configure `backend/.env` if your local backend setup requires it.

**Important:** Never upload your real `.env` files, API keys, passwords, or database credentials to GitHub.

### Step 3: Start the application using Docker

From the project root directory, run:

```bash
docker compose up --build
```

Docker Compose will build and start the services defined in the project configuration.

To run the application in the background:

```bash
docker compose up --build -d
```

Check running containers:

```bash
docker compose ps
```

View application logs:

```bash
docker compose logs -f
```

Stop the application:

```bash
docker compose down
```

---

## 💻 Running Services Individually

If you want to develop or debug individual components, you can run them separately.

### Frontend

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Vite normally serves the frontend at:

```text
http://localhost:5173
```

### AI Service

From the project root, create and activate a Python virtual environment:

**Windows PowerShell:**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
```

Install the AI service dependencies:

```bash
pip install -r requirements.txt
```

Configure the required environment variables before starting the service.

Start the AI service using the application's configured FastAPI entry point. The Docker configuration and application source identify the service startup command and required settings.

The AI service uses port `8001` in the containerized setup.

### Backend

Navigate to the backend directory:

```bash
cd backend
```

Create and activate a Python virtual environment:

**Windows PowerShell:**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

Configure the backend environment variables and database connection before starting the FastAPI application.

---

## 🔑 API and Configuration

BrandGuard AI uses environment variables for configuration.

Before running the application, review:

- `.env.example`
- `backend/.env.example`

Configure the required values for:

- Google Gemini API access
- Database connectivity
- Backend and AI service communication
- Authentication and service security settings

Do not share API keys or private credentials.

---

## 🧪 Testing

The AI service includes automated tests.

From the project root, activate your Python environment and run:

```bash
python -m pytest .\tests\ -v
```

On Linux or macOS:

```bash
python -m pytest tests/ -v
```

Run the relevant backend and frontend tests separately when making changes to those components.

---

## 🛠️ Development Guidelines

If you want to contribute or extend BrandGuard AI:

1. Fork the repository.
2. Clone your fork.
3. Create a separate feature branch.
4. Make your changes.
5. Test your changes locally.
6. Commit your work.
7. Open a Pull Request.

Example:

```bash
git checkout -b feature/your-feature
```

After making changes:

```bash
git add .
git commit -m "Add your feature"
git push origin feature/your-feature
```

Then open a Pull Request on GitHub.

---

## 🔒 Security

- Never commit API keys or secrets.
- Keep `.env` files out of version control.
- Use your own Gemini API key.
- Do not expose database credentials.
- Review configuration before deploying publicly.
- Use secure authentication and HTTPS in production environments.

---

## ⚠️ Important Notes

- Some application features may require external API credentials.
- Google Gemini usage may be subject to API quotas and pricing.
- Database connectivity must be configured correctly.
- Local development settings may differ from production settings.
- AI-generated findings should be reviewed by a human before making important publishing or compliance decisions.

---

## 🤝 Contributing

Contributions, bug reports, suggestions, and improvements are welcome!

If you find an issue or have an idea to improve BrandGuard AI, feel free to open a GitHub Issue or submit a Pull Request.

---

## 👨‍💻 Project

**BrandGuard AI**

GitHub Repository:  
https://github.com/LALIT-X12/BRANDGUARD-AI

Built with ❤️ using React, TypeScript, Python, FastAPI, MongoDB, Docker, and Google Gemini.

---

**⭐ If you find this project useful, consider giving the repository a star!**
