"""Model pipelines for the M11 "Judge the Model" activity.

Builds one fresh, unfitted pipeline per model. ``analysis/evaluate.py`` fits them;
this module only defines them. Every pipeline's first step is the supplied
``encode()`` from ``analysis.data`` (learned from training rows only).

To build and score all models, run from the starter folder:

    python -m analysis
"""

from __future__ import annotations

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from lightgbm import LGBMClassifier

from analysis.data import encode


def baseline():
    """Prevalence baseline: predicts the training-set positive rate for every patient."""
    return DummyClassifier(strategy="prior")


def logreg():
    return Pipeline([
        ("encode", encode()),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=5000)),
    ])


def knn():
    return Pipeline([
        ("encode", encode()),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("clf", KNeighborsClassifier(n_neighbors=25)),
    ])


def rf():
    return Pipeline([
        ("encode", encode()),
        ("imputer", SimpleImputer(strategy="median")),
        ("clf", RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=0, n_jobs=-1)),
    ])


def lgbm():
    return Pipeline([
        ("encode", encode()),
        ("clf", LGBMClassifier(random_state=0, verbose=-1, n_jobs=8)),
    ])


MODELS = {"baseline": baseline, "logreg": logreg, "knn": knn, "rf": rf, "lgbm": lgbm}
