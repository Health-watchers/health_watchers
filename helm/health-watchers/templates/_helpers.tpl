{{/*
Expand the name of the chart.
*/}}
{{- define "health-watchers.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "health-watchers.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "health-watchers.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "health-watchers.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels for a given component
*/}}
{{- define "health-watchers.selectorLabels" -}}
app.kubernetes.io/name: {{ include "health-watchers.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: {{ .component }}
{{- end }}

{{/*
Image reference helper: registry/repository:tag
*/}}
{{- define "health-watchers.image" -}}
{{- printf "%s/%s:%s" .registry .repository .tag }}
{{- end }}
