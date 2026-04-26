# Clinic Scheduling Platform

Backend platform for medical appointment scheduling built with **TypeScript**, **AWS Serverless**, and **Clean Architecture**.

This project simulates a production-grade healthcare booking workflow using asynchronous event-driven processing, multiple data stores, and scalable cloud services.

> Designed as a portfolio project to demonstrate backend engineering skills in distributed systems, serverless architecture, and maintainable code structure.

---

## 🚀 Tech Stack

- TypeScript
- Node.js
- AWS Lambda
- API Gateway
- DynamoDB
- MySQL
- SNS
- SQS
- EventBridge
- Serverless Framework
- Jest
- OpenAPI / Swagger

---

## 🏗️ Architecture

The application follows **Clean Architecture** principles:

- **Domain Layer** → Entities and contracts (ports)
- **Application Layer** → Use cases / business rules
- **Infrastructure Layer** → Databases and messaging adapters
- **API Layer** → AWS Lambda handlers

---

## 📂 Project Structure

```text
src/
├── api/lambda/      Lambda handlers
├── app/usecases/    Application services
├── docs/            OpenAPI docs
├── domain/
│   ├── entities/    Core entities
│   └── ports/       Interfaces / contracts
├── infra/
│   ├── config/      DB config
│   ├── messaging/   SNS / EventBridge adapters
│   └── repos/       DynamoDB / MySQL repositories
├── shared/          Shared helpers
└── tests/           Unit tests
```

---

## ⚙️ Main Workflow

```text
Client
↓
API Gateway
↓
AWS Lambda
↓
DynamoDB (pending request)
↓
SNS Topic
↓
SQS Queue
↓
Worker Lambda
↓
MySQL (final persistence)
↓
EventBridge
↓
Queue Consumer
↓
DynamoDB (completed status)
```

---

## 📌 Features

### Appointment Creation

Creates a new medical appointment request.

### Async Processing

Uses SNS + SQS to process requests in background workers.

### Status Tracking

```text
pending → completed
```

### Country-based Processing

Supports country-specific booking flows (PE / CL).

### Multi-database Design

- DynamoDB for fast state tracking
- MySQL for relational persistence

---

## 📄 API Documentation

OpenAPI contract available at:

```text
src/docs/openapi.yaml
```

### Main Endpoint

```http
POST /appointments
```

### Example Request

```json
{
  "insuredId": "12345",
  "scheduleId": 10,
  "countryISO": "PE"
}
```

### Example Response

```json
{
  "message": "Appointment received",
  "status": "pending"
}
```

---

## 🚀 Local Development

### Install dependencies

```bash
npm install
```

### Build project

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run locally

```bash
npm install --save-dev serverless-offline
npx serverless offline
```

---

## ☁️ Deploy

### Set environment values

```bash
export VPC_ID=your-vpc-id
export SUBNET1_ID=your-subnet-id
export SUBNET2_ID=your-subnet-id
```

### Deploy stack

```bash
npx serverless deploy
```

### Remove stack

```bash
npx serverless remove --stage dev
```

---

## 📜 Logs

```bash
npx serverless logs -f createAppointment -t
npx serverless logs -f appointmentPE -t
npx serverless logs -f appointmentCL -t
npx serverless logs -f processConfirmations -t
```

---

## 🧪 Testing

Includes unit tests for:

- Lambda handlers
- Application services
- Business logic

```bash
npm test
```

---

## 💡 What This Project Demonstrates

- Backend architecture design
- Clean Architecture implementation
- Event-driven systems
- AWS Serverless ecosystem
- Multi-database strategies
- Testing practices
- Scalable asynchronous workflows

---

## 📈 Future Improvements

- Authentication / RBAC
- CI/CD pipeline
- Retry strategies + DLQ
- Monitoring with CloudWatch
- Integration tests
- Notifications (Email / SMS)

---

## 👨‍💻 Author

**AP Chavez**  
Backend Engineer focused on Node.js, TypeScript, AWS, and scalable systems.