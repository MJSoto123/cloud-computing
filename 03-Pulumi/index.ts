import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();
const projectId = gcp.config.project!;
const region = gcp.config.region || "us-central1";
const zone = config.get("zone") || "us-central1-a";
const clusterName = "mern-cluster";

const useSpotNodes = false;
const nodeMachineType = "e2-medium";
const nodeDiskType = "pd-standard";
const nodeDiskSizeGb = 20;

const cluster = new gcp.container.Cluster(clusterName, {
  location: zone,
  initialNodeCount: 1,
  removeDefaultNodePool: true,
  releaseChannel: { channel: "REGULAR" },
});

const nodePool = new gcp.container.NodePool("primary-node-pool", {
  location: zone,
  cluster: cluster.name,
  nodeCount: 1,
  autoscaling: {
    minNodeCount: 1,
    maxNodeCount: 4,
  },
  nodeConfig: {
    machineType: nodeMachineType,
    diskType: nodeDiskType,
    diskSizeGb: nodeDiskSizeGb,
    spot: useSpotNodes,
    oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
  },
});

const k8sProvider = new k8s.Provider("gke-k8s", {
  kubeconfig: pulumi
    .all([cluster.name, cluster.endpoint, cluster.masterAuth])
    .apply(([name, endpoint, masterAuth]) => {
      const context = `${projectId}_${zone}_${name}`;
      return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin
      provideClusterInfo: true
`;
    }),
}, { dependsOn: [nodePool] });

const mongoDeployment = new k8s.apps.v1.Deployment("mongodb", {
  metadata: { name: "mongodb" },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: "mongodb" } },
    template: {
      metadata: { labels: { app: "mongodb" } },
      spec: {
        containers: [{
          name: "mongodb",
          image: "mongo:7.0",
          ports: [{ containerPort: 27017 }],
          env: [
            { name: "MONGO_INITDB_ROOT_USERNAME", value: "admin" },
            { name: "MONGO_INITDB_ROOT_PASSWORD", value: "password123" },
            { name: "MONGO_INITDB_DATABASE", value: "myapp" },
          ],
          resources: {
            requests: { memory: "128Mi", cpu: "100m" },
            limits:   { memory: "256Mi", cpu: "250m" },
          },
        }],
      },
    },
  },
}, { provider: k8sProvider });

const mongoService = new k8s.core.v1.Service("mongodb-service", {
  metadata: { name: "mongodb-service" },
  spec: {
    type: "ClusterIP",
    selector: { app: "mongodb" },
    ports: [{ port: 27017, targetPort: 27017 }],
  },
}, { provider: k8sProvider });

const backendDeployment = new k8s.apps.v1.Deployment("backend", {
  metadata: { name: "backend" },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: "backend" } },
    template: {
      metadata: { labels: { app: "backend" } },
      spec: {
        containers: [{
          name: "backend",
          image: `gcr.io/${projectId}/backend:v1`,
          ports: [{ containerPort: 3000 }],
          env: [
            { name: "PORT", value: "3000" },
            { name: "MONGODB_URI", value: "mongodb://admin:password123@mongodb-service:27017/myapp?authSource=admin" },
            { name: "NODE_ENV", value: "production" },
          ],
          resources: {
            requests: { memory: "128Mi", cpu: "100m" },
            limits:   { memory: "256Mi", cpu: "250m" },
          },
          livenessProbe: {
            httpGet: { path: "/health", port: 3000 },
            initialDelaySeconds: 30,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: { path: "/ready", port: 3000 },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [mongoService] });

const backendService = new k8s.core.v1.Service("backend-service", {
  metadata: { name: "backend-service" },
  spec: {
    type: "ClusterIP",
    selector: { app: "backend" },
    ports: [{ port: 3000, targetPort: 3000 }],
  },
}, { provider: k8sProvider });

const backendHpa = new k8s.autoscaling.v2.HorizontalPodAutoscaler("backend-hpa", {
  metadata: { name: "backend-hpa" },
  spec: {
    scaleTargetRef: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "backend",
    },
    minReplicas: 1,
    maxReplicas: 10,
    metrics: [
      {
        type: "Resource",
        resource: {
          name: "cpu",
          target: { type: "Utilization", averageUtilization: 30 },
        },
      },
      {
        type: "Resource",
        resource: {
          name: "memory",
          target: { type: "Utilization", averageUtilization: 70 },
        },
      },
    ],
  },
}, { provider: k8sProvider });

const frontendDeployment = new k8s.apps.v1.Deployment("frontend", {
  metadata: { name: "frontend" },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: "frontend" } },
    template: {
      metadata: { labels: { app: "frontend" } },
      spec: {
        containers: [{
          name: "frontend",
          image: `gcr.io/${projectId}/frontend:v1`,
          ports: [{ containerPort: 4000 }],
          resources: {
            requests: { memory: "128Mi", cpu: "100m" },
            limits:   { memory: "256Mi", cpu: "250m" },
          },
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [backendService] });

const frontendService = new k8s.core.v1.Service("frontend-service", {
  metadata: { name: "frontend-service" },
  spec: {
    type: "LoadBalancer",
    selector: { app: "frontend" },
    ports: [{ port: 80, targetPort: 4000 }],
  },
}, { provider: k8sProvider });

const frontendHpa = new k8s.autoscaling.v2.HorizontalPodAutoscaler("frontend-hpa", {
  metadata: { name: "frontend-hpa" },
  spec: {
    scaleTargetRef: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "frontend",
    },
    minReplicas: 1,
    maxReplicas: 8,
    metrics: [
      {
        type: "Resource",
        resource: {
          name: "cpu",
          target: { type: "Utilization", averageUtilization: 30 },
        },
      },
    ],
  },
}, { provider: k8sProvider });

export const clusterName_output = cluster.name;

export const kubeconfig = pulumi.secret(
  pulumi.all([cluster.name, cluster.endpoint, cluster.masterAuth])
    .apply(([name, endpoint, auth]) => {
      const context = `${projectId}_${zone}_${name}`;
      return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${auth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
users:
- name: ${context}
  user:
    exec:
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin
      provideClusterInfo: true
      apiVersion: client.authentication.k8s.io/v1beta1
`;
    })
);

export const frontendUrl = frontendService.status.apply(
  (status) => status?.loadBalancer?.ingress?.[0]?.ip || "pending"
);