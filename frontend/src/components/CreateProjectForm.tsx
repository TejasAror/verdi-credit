'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { ProjectType } from '@/lib/types';

const DEFAULT_POLYGON = JSON.stringify(
  {
    type: 'Polygon',
    coordinates: [
      [
        [-60.0, -3.0],
        [-59.9, -3.0],
        [-59.9, -2.9],
        [-60.0, -2.9],
        [-60.0, -3.0],
      ],
    ],
  },
  null,
  2,
);

const PROJECT_TYPES: ProjectType[] = [
  'REFORESTATION',
  'SOIL_CARBON',
  'RENEWABLE_ENERGY',
];

export default function CreateProjectForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { token } = useAuth();
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] =
    useState<ProjectType>('REFORESTATION');
  const [methodology, setMethodology] = useState('');
  const [expectedAnnualTonnes, setExpectedAnnualTonnes] = useState('');
  const [polygonJson, setPolygonJson] = useState(DEFAULT_POLYGON);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    let geoPolygon: unknown;
    try {
      geoPolygon = JSON.parse(polygonJson);
    } catch {
      setError('Polygon JSON is invalid. Provide a valid GeoJSON object.');
      setBusy(false);
      return;
    }

    const payload: { projectName: string; projectType: ProjectType; methodology: string; expectedAnnualTonnes: number; geoPolygon: unknown } = {
      projectName,
      projectType,
      methodology,
      expectedAnnualTonnes: parseFloat(expectedAnnualTonnes),
      geoPolygon,
    };

    try {
      await apiFetch('/projects', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify(payload),
      });
      // Reset form.
      setProjectName('');
      setMethodology('');
      setExpectedAnnualTonnes('');
      setPolygonJson(DEFAULT_POLYGON);
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create project.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Register a Project
        </h2>
        <p className="text-sm text-slate-500">
          Geo-polygon, methodology and expected tonnes are required.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Project Name
        </label>
        <input
          required
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className={inputClass}
          placeholder="Amazon Reforestation Phase 1"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Type
        </label>
        <select
          value={projectType}
          onChange={(e) => setProjectType(e.target.value as ProjectType)}
          className={inputClass}
        >
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Methodology
        </label>
        <input
          required
          value={methodology}
          onChange={(e) => setMethodology(e.target.value)}
          className={inputClass}
          placeholder="VM0033 - Afforestation, Reforestation and Revegetation"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Expected Annual Tonnes (CO₂)
        </label>
        <input
          required
          type="number"
          step="0.0001"
          min="0"
          value={expectedAnnualTonnes}
          onChange={(e) => setExpectedAnnualTonnes(e.target.value)}
          className={inputClass}
          placeholder="1250.5"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Polygon (GeoJSON)
        </label>
        <textarea
          required
          value={polygonJson}
          onChange={(e) => setPolygonJson(e.target.value)}
          rows={8}
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create Project'}
      </button>
    </form>
  );
}
