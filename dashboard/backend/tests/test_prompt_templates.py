"""
Unit tests for prompt templates router.
Tests CRUD operations for AI prompt templates.
"""
import pytest


@pytest.fixture
def sample_prompt_templates(db):
    """Create sample prompt templates."""
    from app.models import PromptTemplate
    
    templates = [
        PromptTemplate(name='Template 1', description='First template', template='Prompt: {context}', is_active=True, created_by='system'),
        PromptTemplate(name='Template 2', description='Second template', template='Question: {question}', is_active=False, created_by='system'),
        PromptTemplate(name='Template 3', description='Third template', template='Analyze: {data}', is_active=False, created_by='system')
    ]
    db.add_all(templates)
    db.flush()
    
    # Return list of dicts for compatibility
    return [{'id': t.id, 'name': t.name, 'description': t.description, 'template': t.template, 'is_active': t.is_active} for t in templates]


# ============ List Templates Tests ============

def test_list_templates_empty(client, db):
    """Test listing templates when none exist."""
    response = client.get("/api/admin/etl/prompt-templates")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "templates" in data
    assert "total" in data
    assert isinstance(data["templates"], list)
    assert len(data["templates"]) == 0
    assert data["total"] == 0


def test_list_templates(client, sample_prompt_templates):
    """Test listing all prompt templates."""
    response = client.get("/api/admin/etl/prompt-templates")
    assert response.status_code == 200
    data = response.json()
    assert "templates" in data
    assert data["total"] == 3
    templates = data["templates"]
    assert len(templates) == 3
    assert templates[0]["name"] == "Template 1"
    assert templates[0]["is_active"] is True
    assert templates[1]["is_active"] is False


# ============ Get Template Tests ============

def test_get_template(client, sample_prompt_templates):
    """Test getting a specific template."""
    template_id = sample_prompt_templates[0]["id"]
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Template 1"
    assert data["template"] == "Prompt: {context}"
    assert data["is_active"] is True


def test_get_template_not_found(client, db):
    """Test getting a non-existent template."""
    response = client.get("/api/admin/etl/prompt-templates/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ============ Create Template Tests ============

def test_create_template(admin_client, db):
    """Test creating a new prompt template."""
    data = {
        "name": "New Template",
        "description": "A new test template",
        "template": "Process: {input}"
    }
    response = admin_client.post("/api/admin/etl/prompt-templates", json=data)
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    template = result["template"]
    assert template["name"] == "New Template"
    assert template["description"] == "A new test template"
    assert template["template"] == "Process: {input}"
    assert template["is_active"] is False  # New templates are inactive by default
    assert "id" in template
    assert "created_at" in template


def test_create_template_minimal(admin_client, db):
    """Test creating a template with minimal data."""
    data = {
        "name": "Minimal Template",
        "template": "Simple template"
    }
    response = admin_client.post("/api/admin/etl/prompt-templates", json=data)
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    template = result["template"]
    assert template["name"] == "Minimal Template"
    assert template["description"] is None
    assert template["template"] == "Simple template"


def test_create_template_duplicate_name(admin_client, sample_prompt_templates):
    """Test creating a template with duplicate name."""
    data = {
        "name": "Template 1",  # Already exists
        "template": "Test template"
    }
    response = admin_client.post("/api/admin/etl/prompt-templates", json=data)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_create_template_invalid_data(admin_client, db):
    """Test creating a template with invalid data."""
    # Empty name
    response = admin_client.post("/api/admin/etl/prompt-templates", json={
        "name": "",
        "template": "test"
    })
    assert response.status_code == 422

    # Empty template
    response = admin_client.post("/api/admin/etl/prompt-templates", json={
        "name": "Test",
        "template": ""
    })
    assert response.status_code == 422

    # Missing required fields
    response = admin_client.post("/api/admin/etl/prompt-templates", json={
        "name": "Test"
    })
    assert response.status_code == 422


# ============ Update Template Tests ============

def test_update_template(admin_client, client, sample_prompt_templates):
    """Test updating a prompt template."""
    template_id = sample_prompt_templates[0]["id"]
    update_data = {
        "name": "Updated Template",
        "description": "Updated description",
        "template": "Updated: {content}"
    }
    response = admin_client.put(f"/api/admin/etl/prompt-templates/{template_id}", json=update_data)
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    assert result["template_id"] == template_id

    # Check DB update
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    data = response.json()
    assert data["name"] == "Updated Template"
    assert data["description"] == "Updated description"
    assert data["template"] == "Updated: {content}"


def test_update_template_partial(admin_client, client, sample_prompt_templates):
    """Test partial update of a template."""
    template_id = sample_prompt_templates[0]["id"]

    # Only update name
    response = admin_client.put(f"/api/admin/etl/prompt-templates/{template_id}", json={
        "name": "Partially Updated"
    })
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True

    # Check DB update
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    data = response.json()
    assert data["name"] == "Partially Updated"
    assert data["template"] == "Prompt: {context}"  # Unchanged


def test_delete_template(admin_client, client, sample_prompt_templates):
    """Test deleting a prompt template."""
    # Delete an inactive template
    template_id = sample_prompt_templates[1]["id"]
    response = admin_client.delete(f"/api/admin/etl/prompt-templates/{template_id}")
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    assert "deleted successfully" in result["message"].lower()

    # Verify it's deleted
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    assert response.status_code == 404


def test_activate_template(admin_client, client, sample_prompt_templates):
    """Test activating a template."""
    # Activate Template 2 (currently inactive)
    template_id = sample_prompt_templates[1]["id"]
    response = admin_client.post(f"/api/admin/etl/prompt-templates/{template_id}/activate")
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True
    assert "activated successfully" in result["message"].lower()

    # Verify it's now active
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    # Verify previous active template is now inactive
    old_active_id = sample_prompt_templates[0]["id"]
    response = client.get(f"/api/admin/etl/prompt-templates/{old_active_id}")
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_activate_already_active_template(admin_client, client, sample_prompt_templates):
    """Test activating an already active template."""
    template_id = sample_prompt_templates[0]["id"]  # Already active
    response = admin_client.post(f"/api/admin/etl/prompt-templates/{template_id}/activate")
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True

    # Verify it's still active
    response = client.get(f"/api/admin/etl/prompt-templates/{template_id}")
    assert response.status_code == 200
    assert response.json()["is_active"] is True


# ============ Get Active Template Tests ============

def test_get_active_template(client, sample_prompt_templates):
    """Test getting the currently active template."""
    response = client.get("/api/admin/etl/prompt-templates/active/current")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Template 1"
    assert data["is_active"] is True


def test_get_active_template_none_active(client, db):
    """Test getting active template when none is active."""
    from app.models import PromptTemplate
    
    # Create inactive templates only
    template = PromptTemplate(name='Inactive', template='Test', is_active=False, created_by='system')
    db.add(template)
    db.flush()
    
    response = client.get("/api/admin/etl/prompt-templates/active/current")
    assert response.status_code == 404
    assert "no active template" in response.json()["detail"].lower()


# ============ Edge Cases ============

def test_create_template_long_name(admin_client, db):
    """Test creating a template with very long name."""
    data = {
        "name": "A" * 256,  # Exceeds max length (255)
        "template": "Test"
    }
    response = admin_client.post("/api/admin/etl/prompt-templates", json=data)
    assert response.status_code == 422


def test_update_template_empty_fields(admin_client, sample_prompt_templates):
    """Test updating with empty optional fields."""
    template_id = sample_prompt_templates[0]["id"]

    # Try to update with empty name (should fail)
    response = admin_client.put(f"/api/admin/etl/prompt-templates/{template_id}", json={
        "name": ""
    })
    assert response.status_code == 422

    # Try to update with empty template (should fail)
    response = admin_client.put(f"/api/admin/etl/prompt-templates/{template_id}", json={
        "template": ""
    })
    assert response.status_code == 422
