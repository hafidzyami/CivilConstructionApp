import swaggerJsdoc from "swagger-jsdoc";

const routesPath = process.env.NODE_ENV === 'production'
  ? './dist/routes/*.js'
  : './src/routes/*.ts';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Civil Construction API",
      version: "1.0.0",
      description: "API documentation for Civil Construction Application",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: "http://localhost:6969",
        description: "Development server",
      },
      {
        url: "https://api-civil.ganeshait.com",
        description: "Production server",
      },
    ],
    tags: [
      {
        name: "Details",
        description: "Construction detail management endpoints",
      },
    ],
  },
  apis: [routesPath], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
