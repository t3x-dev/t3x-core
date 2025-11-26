from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="contextflow-sdk",
    version="0.1.0",
    author="ContextFlow Contributors",
    author_email="",
    description="Official Python SDK for the ContextFlow specification",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/contextflow",
    packages=find_packages(),
    include_package_data=True,
    package_data={"contextflow": ["schema/*.json"]},
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.9",
    install_requires=[
        "pydantic>=2.0.0",
        "jsonschema>=4.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
            "ruff>=0.1.0",
        ],
    },
)
